/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import config from 'config'
import GameRoom from './models/GameRoom.js'
import Player from './models/Player.js'
import * as gameLogic from './gameLogic.js'

const serverPort: number = config.has('server.ports') ? config.get('server.ports') : 8080
const wss: WebSocketServer = new WebSocketServer({
  port: serverPort
})
const players: Map<string, Player> = new Map()
const connections: Map<string, WebSocket> = new Map()
const gamerooms: Map<string, GameRoom> = new Map()

/**
 * Websocket server connection
 */
wss.on('connection', (ws: WebSocket, request) => {
  console.log('A player connected')

  // Handle Player initial data
  const cookieUid = getUidFromCookies(request.headers.cookie ?? '')
  const id: string = cookieUid !== '' ? cookieUid : generateRandomString('player')
  let player: Player | undefined

  if (players.has(id)) {
    // Player is already started session before
    player = players.get(id)
    if (player) {
      connections.set(id, ws)
      const gameroom: GameRoom | undefined = player.gameRoomId
        ? gamerooms.get(player.gameRoomId)
        : undefined
      gameLogic.handlePlayerSessionStart(ws, player, gameroom)
    }
  } else {
    // New user session
    player = new Player(id, 'test-' + id)
    gameLogic.handlePlayerSessionStart(ws, player)
    players.set(id, player)
    connections.set(id, ws)
  }

  // Handle WebSocket messages
  ws.on('message', async (data: string) => {
    console.log('received: %s', data)

    if (!player) {
      return
    }

    player.lastActiveTime = new Date().getTime()

    try {
      const message = JSON.parse(data)
      console.log(message)
      var gameroom =
        player.gameRoomId && gamerooms.has(player.gameRoomId)
          ? gamerooms.get(player.gameRoomId)
          : undefined
      var opponent: Player | undefined = gameroom
        ? gameroom.player1 === player
          ? gameroom.player2
          : gameroom.player1
        : undefined

      var opponentWs: WebSocket | undefined =
        opponent && connections.has(opponent.id) ? connections.get(opponent.id) : undefined

      switch (message.type) {
        case 'randomize-ships':
          gameLogic.handleRandomizeShips(ws, player, gameroom)
          break
        case 'reset-ships':
          gameLogic.handleResetShips(ws, player, gameroom)
          break
        case 'place-ship':
          gameLogic.handlePlaceShip(ws, player, gameroom, message.data)
          break
        case 'remove-ship':
          gameLogic.handleRemoveShip(ws, player, gameroom, message.data)
          break
        case 'attack-cell':
          await gameLogic.handleAttackCell(ws, player, gameroom, message.data, opponent, opponentWs)

          break
        case 'create-room': {
          const newGameRoom = gameLogic.handleCreateRoom(
            ws,
            player,
            generateRandomString('gameroom'),
            message.data
          )
          gamerooms.set(newGameRoom.id, newGameRoom)

          if (message.data && message.data.type && message.data.type == 'computer') {
            gameLogic.handleAddAIPlayer(ws, newGameRoom, generateRandomString('player'))
            newGameRoom.isGameStarted = true
          }

          break
        }
        case 'leave-game':
          gameLogic.handleLeaveGame(ws, player, gameroom, opponentWs)
          if (gameroom && !gameroom.player1 && !gameroom.player2) {
            gamerooms.delete(gameroom.id)
          }

          break
        case 'join-room': {
          if (message.data && message.data.id) {
            if (gameroom && gameroom.id === message.data.id) {
              gameLogic.handleJoinRoom(ws, player, gameroom, opponentWs)
              return
            }

            const gameroomFriend = gamerooms.get(message.data.id)
            if (!gameroomFriend) {
              throw new Error(
                'The gameroom not found. Please recheck if the link is valid and friend is still in the gameroom.'
              )
            }

            if (gameroomFriend.player2 && gameroomFriend.player2 !== player) {
              throw new Error('Failed to join the gameroom. The gameroom is already full.')
            }

            if (
              gameroomFriend.isGameStarted &&
              (!gameroomFriend.player1 || !gameroomFriend.player2)
            ) {
              throw new Error('Failed to join the gameroom. The game is already ended.')
            }

            const opponentNew: Player | undefined = gameroomFriend.player1
              ? gameroomFriend.player1
              : gameroomFriend.player2

            const opponentWsNew: WebSocket | undefined =
              opponentNew && connections.has(opponentNew.id)
                ? connections.get(opponentNew.id)
                : undefined

            if (!opponentWsNew) {
              throw new Error('Could not join the gameroom. The friend is not connected to game.')
            }

            gameLogic.handleJoinRoom(ws, player, gameroomFriend, opponentWsNew)
          } else {
            const gameroomAvailiable = Array.from(gamerooms.values()).find(
              (room) =>
                room.player1 &&
                room.player2 === undefined &&
                room.type === 'random' &&
                connections.has(room.player1.id)
            )

            if (gameroomAvailiable) {
              const opponentWsNew: WebSocket | undefined = gameroomAvailiable.player1
                ? connections.get(gameroomAvailiable.player1.id)
                : undefined

              if (opponentWsNew) {
                gameLogic.handleJoinRoom(ws, player, gameroomAvailiable, opponentWsNew)
                gameLogic.handleStartGame(ws, player, gameroomAvailiable, opponentWsNew)
              }
            } else {
              const newGameRoom = gameLogic.handleCreateRoom(
                ws,
                player,
                generateRandomString('gameroom'),
                message.data
              )
              gamerooms.set(newGameRoom.id, newGameRoom)
            }
          }
          break
        }
        case 'ready':
          gameLogic.handleReady(ws, player, gameroom, opponentWs, message.data)
          break
      }
    } catch (error: any) {
      console.log(error)
      if (typeof error.message === 'string') {
        ws.send(
          JSON.stringify({
            type: 'error',
            data: {
              message: error.message
            }
          })
        )
      }
    }
  })

  // Handle WebSocket disconnects
  ws.on('close', () => {
    console.log('A player disconnected')
    if (player && player.gameRoomId && gamerooms.has(player.gameRoomId)) {
      const gameroom: GameRoom | undefined = gamerooms.get(player.gameRoomId)
      // Exit waiting room if game is not yet started
      if (gameroom && !gameroom.isGameStarted && gameroom.type !== 'friend') {
        gamerooms.delete(gameroom.id)
        player.gameRoomId = undefined
      }
    }
  })
})

// Close inactive connections every 5 minutes
setInterval(closeInactiveConnections, 5 * 60 * 1000)

/**
 * Get user ID from the cookie.
 * @param cookies Cookies from the request header data.
 * @returns Returns user ID.
 */
function getUidFromCookies(cookies: string): string {
  const cookieName = 'uid='
  try {
    for (const cookie of cookies.split(';')) {
      if (cookie.indexOf(cookieName) == 0) {
        return cookie.substring(cookieName.length, cookie.length)
      }
    }
  } catch (error) {
    console.log(error)
  }
  return ''
}

/**
 * Return randomly generated string and checks if no user or gameroom is assigned already.
 * @param type The object type that needs a unique ID (eg, player, gameroom).
 * @returns Randomly generated user ID.
 */
function generateRandomString(type: string = ''): string {
  let ID = Math.random().toString(36).substring(4)

  if (type === 'player') {
    while (players.has(ID)) {
      ID = Math.random().toString(36).substring(4)
    }
  } else if (type === 'gameroom') {
    while (gamerooms.has(ID)) {
      ID = Math.random().toString(36).substring(4)
    }
  }

  return ID
}

/**
 * Check and close inactive connections if user is not reached Websocket in 15 minutes
 */
function closeInactiveConnections() {
  const currentTime = new Date().getTime()
  connections.forEach((ws, playerId) => {
    const player = players.get(playerId)
    const playerLastActiveTime = player ? player.lastActiveTime : 0
    const fifteenMin = 15 * 60 * 1000
    if (currentTime - playerLastActiveTime > fifteenMin) {
      ws.close()
      if (player && player.gameRoomId) {
        const gameroom = gamerooms.get(player.gameRoomId)
        const opponentWs =
          gameroom && gameroom.player1 === player && gameroom.player2
            ? connections.get(gameroom.player2.id)
            : gameroom?.player1
            ? connections.get(gameroom.player1.id)
            : undefined

        gameLogic.handleLeaveGame(ws, player, gameroom, opponentWs)
      }
      players.delete(playerId)
      connections.delete(playerId)
      console.log(`Closed inactive connection for player ${playerId}`)
    }
  })

  // Clear all inactive gamerooms
  gamerooms.forEach((gameroom, gameroomId) => {
    if (!gameroom.player1 && !gameroom.player2) {
      gamerooms.delete(gameroomId)
    }
  })
}
