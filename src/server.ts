/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import config from 'config'
import GameRoom from './models/GameRoom.js'
import Player from './models/Player.js'
import PlayerAI from './models/PlayerAI.js'
import Ship from './models/Ship.js'

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
  const id: string = cookieUid !== '' ? cookieUid : generateRandomString()
  let player: Player | undefined

  if (players.has(id)) {
    // Player is already started session before
    player = players.get(id)
    if (player) {
      sendPlayerData(ws, player)
      connections.set(id, ws)
      if (player.gameRoomId && gamerooms.has(player.gameRoomId)) {
        sendAction(ws, 'game-started')

        const gameroom = gamerooms.get(player.gameRoomId)
        if (gameroom) {
          if (gameroom.currentPlayer === player) {
            sendAction(ws, 'player-turn')
          } else {
            sendAction(ws, 'opponent-turn')
          }
        }
      }
    }
  } else {
    // New user session
    player = new Player(id)
    sendPlayerData(ws, player)
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
          : null
      var opponent: Player | undefined = gameroom
        ? gameroom.player1 === player
          ? gameroom.player2
          : gameroom.player1
        : undefined

      var opponentWs: WebSocket | undefined =
        opponent && connections.has(opponent.id) ? connections.get(opponent.id) : undefined

      switch (message.type) {
        case 'randomize-ships':
          if (gameroom) {
            throw new Error('Cannot randomize ships! Game already started')
          }

          player.gameboard.placeShipsRandomly()
          sendPlayerData(ws, player)
          break
        case 'reset-ships':
          if (gameroom) {
            throw new Error('Cannot reset ship! Game already started')
          }

          player.gameboard.cleanBoard()
          sendPlayerData(ws, player)
          break
        case 'place-ship':
          if (gameroom) {
            throw new Error('Cannot place ship! Game already started')
          }

          if (message.data.ship_id && message.data.position) {
            const ship: Ship | undefined = player.gameboard.getShipById(message.data.ship_id)
            if (ship) {
              player.gameboard.placeShip(ship, message.data.position)
              sendPlayerData(ws, player)
            }
          }
          break
        case 'remove-ship':
          if (gameroom) {
            throw new Error('Cannot remove ship! Game already started')
          }

          if (message.data.ship_id) {
            const ship: Ship | undefined = player.gameboard.getShipById(message.data.ship_id)
            if (ship) {
              player.gameboard.cleanBoardOnShip(ship)
              ship.cleanData()
              sendPlayerData(ws, player)
            }
          }
          break
        case 'join-room': {
          if (!player.gameboard.isAllShipsOnBoard()) {
            throw new Error('Place ships before joining a room.')
          }

          const gameRoom = Array.from(gamerooms.values()).find((room) => room.player2 === undefined)

          if (gameRoom) {
            gameRoom.player2 = player
            player.gameRoomId = gameRoom.id

            const opponentWs: WebSocket | undefined = connections.get(gameRoom.player1.id)
            if (opponentWs) {
              sendAction(opponentWs, 'player-turn')
              sendAction(ws, 'opponent-turn')

              sendAction(ws, 'game-started')
              sendAction(opponentWs, 'game-started')
            }
          } else {
            const newGameRoom = new GameRoom(generateRandomString(), player)
            gamerooms.set(newGameRoom.id, newGameRoom)
            player.gameRoomId = newGameRoom.id
            sendAction(ws, 'game-created')
          }

          break
        }
        case 'create-room-ai':
          if (!player.gameboard.isAllShipsOnBoard()) {
            throw new Error('Place ships before starting a new game.')
          }

          if (!gameroom) {
            const newGameRoom = new GameRoom(generateRandomString(), player)
            newGameRoom.playerAI = new PlayerAI(generateRandomString())
            gamerooms.set(newGameRoom.id, newGameRoom)
            player.gameRoomId = newGameRoom.id

            sendAction(ws, 'game-started')
          }
          break
        case 'leave-game':
          player.gameboard.cleanBoard()
          player.enemyGameboard.cleanBoard()

          if (gameroom) {
            gamerooms.delete(gameroom.id)
            player.gameRoomId = undefined
          }

          sendPlayerData(ws, player)

          if (opponent && opponentWs) {
            opponent.gameboard.cleanBoard()
            opponent.enemyGameboard.cleanBoard()
            sendAction(opponentWs, 'opponent-disconnected')
          }
          break
        case 'attack-cell':
          if (!gameroom) {
            throw new Error('Gameroom is not created. Please create a new game.')
          }

          if (!gameroom.playerAI && (!opponentWs || !opponent)) {
            player.gameboard.cleanBoard()
            player.enemyGameboard.cleanBoard()
            sendAction(ws, 'opponent-disconnected')
            throw new Error('Opponent disconnected!')
          }

          if (gameroom.currentPlayer !== player) {
            throw new Error('This is not your turn. Please wait!')
          }

          if (gameroom.makeAttack(message.data.row, message.data.col)) {
            sendPlayerData(ws, player)

            if (!gameroom.playerAI) {
              if (!opponentWs || !opponent) {
                throw new Error('Opponent disconnected!')
              }
              sendPlayerData(opponentWs, opponent)
            }

            if (gameroom.currentPlayer === player) {
              sendAction(ws, 'player-turn')
            } else {
              sendAction(ws, 'opponent-turn')
              if (!gameroom.playerAI) {
                if (!opponentWs) {
                  throw new Error('Opponent disconnected!')
                }
                sendAction(opponentWs, 'player-turn')
              }
            }
          } else {
            throw new Error('Please provide valid attacking coordinates!')
          }

          if (gameroom.currentPlayer !== player && gameroom.playerAI) {
            while (gameroom.currentPlayer.id === gameroom.playerAI.id) {
              gameroom.makeAIAttack()
              await delay(1000)
              sendPlayerData(ws, player)
            }
            sendAction(ws, 'player-turn')
          }

          break
      }
    } catch (error: any) {
      console.log(error)
      if (typeof error.message === 'string') {
        sendNotification(ws, 'error', error.message)
      }
    }
  })

  // Handle WebSocket disconnects
  ws.on('close', () => {
    console.log('A player disconnected')
    if (player && player.gameRoomId && gamerooms.has(player.gameRoomId)) {
      const gameroom: GameRoom | undefined = gamerooms.get(player.gameRoomId)
      // Exit waiting room if game is not yet started
      if (gameroom && !gameroom.playerAI && !gameroom.player2) {
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
 * Return randomly generated string and checks if no user is assigned already.
 * @returns Randomly generated user ID.
 */
function generateRandomString(): string {
  let playerID = Math.random().toString(36).substring(4)

  while (players.has(playerID)) {
    playerID = Math.random().toString(36).substring(4)
  }

  return playerID
}

/**
 * Sends player data to the connection
 *
 * @param ws Current connection websocket
 * @param player Current data about player
 */
function sendPlayerData(ws: WebSocket, player: Player): void {
  ws.send(
    JSON.stringify({
      type: 'player',
      data: {
        player: player
      }
    })
  )
}

/**
 * Sends a notification message to a player
 *
 * @param ws Current connection websocket
 * @param type The type of the message (eg., success, error)
 * @param notification The message to display to the user
 */
function sendNotification(ws: WebSocket, type: string, notification: string): void {
  ws.send(
    JSON.stringify({
      type: 'notification',
      data: {
        type: type,
        message: notification
      }
    })
  )
}

/**
 * Sends a simple action to the player
 *
 * @param ws Current connection websocket
 * @param type The action to perform
 */
function sendAction(ws: WebSocket, type: string): void {
  ws.send(
    JSON.stringify({
      type: type,
      data: null
    })
  )
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
        gamerooms.delete(player.gameRoomId)
      }
      players.delete(playerId)
      connections.delete(playerId)
      console.log(`Closed inactive connection for player ${playerId}`)
    }
  })
}

/**
 * Helper function to timeout the code execution.
 * @param ms Time in miliseconds
 */
async function delay(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
