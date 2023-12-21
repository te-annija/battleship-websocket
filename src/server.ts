/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import config from 'config'
import GameSession from './models/GameSession.js'
import Player from './models/Player.js'
import * as gameLogic from './gameLogic.js'
import * as gameSessionLogic from './gameSessionLogic.js'
import redisService from './services/RedisService.js'
import { GameSessionType } from 'enums/GameSessionType.js'
import backendService from './services/BackendService.js'

const serverPort: number = config.has('server.ports') ? config.get('server.ports') : 8080
const wss: WebSocketServer = new WebSocketServer({
  port: serverPort
})

const connections: Map<string, WebSocket> = new Map()
const availiableSessions: string[] = []

/**
 * Websocket server connection
 */
wss.on('connection', async (ws: WebSocket, request) => {
  console.log('A player connected')

  // Handle Player initial data
  const cookieUid = getKeyFromCookies(request.headers.cookie ?? '', 'uid')
  const userToken = getKeyFromCookies(request.headers.cookie ?? '', 'token')

  const user = await backendService.getUserData(userToken)

  const id: string = user
    ? user.username
    : cookieUid !== ''
    ? cookieUid
    : await generateRandomString('player')
  let player: Player | undefined = await redisService.getPlayerData(id)

  if (player) {
    // User is already started session before.
    connections.set(id, ws)
    const gameSession: GameSession | undefined = player.gameSessionId
      ? await redisService.getGameSessionObject(player.gameSessionId)
      : undefined

    const opponent: Player | undefined = await getOpponentData(player.id, gameSession)
    await gameSessionLogic.handlePlayerSessionStart(ws, player, gameSession, opponent)
  } else {
    // New user session.
    const playerUsername: string = user ? user.username : `player-${id}`
    player = new Player(id, playerUsername)
    if (user) {
      player.difficulty = user.rank.difficulty
    }
    connections.set(id, ws)
    await gameSessionLogic.handlePlayerSessionStart(ws, player)
  }

  await redisService.setPlayerData(player)

  // Handle WebSocket messages
  ws.on('message', async (data: string) => {
    console.log('received: %s', data)

    if (!player) {
      ws.close()
      return
    }

    player = await redisService.getPlayerData(player.id)

    if (!player) {
      ws.close()
      return
    }

    player.lastActiveTime = new Date().getTime()

    try {
      const message = JSON.parse(data)

      const gameSession: GameSession | undefined = player.gameSessionId
        ? await redisService.getGameSessionObject(player.gameSessionId)
        : undefined

      const opponent: Player | undefined = await getOpponentData(player.id, gameSession)
      const opponentWs: WebSocket | undefined = opponent ? connections.get(opponent.id) : undefined

      switch (message.type) {
        case 'place-ship':
          gameLogic.handlePlaceShip(ws, player, message.data, gameSession)
          break
        case 'randomize-ships':
          gameLogic.handleRandomizeShips(ws, player, gameSession)
          break
        case 'remove-ship':
          gameLogic.handleRemoveShip(ws, player, message.data, gameSession)
          break
        case 'reset-ships':
          gameLogic.handleResetShips(ws, player, gameSession)
          break
        case 'attack-cell': {
          await gameLogic.handleAttackCell(
            ws,
            player,
            message.data,
            gameSession,
            opponent,
            opponentWs
          )

          if (opponent) {
            redisService.setPlayerData(opponent)
          }

          break
        }
        case 'join-game-random': {
          const user = await backendService.getUserData(userToken)
          if (user) {
            player.difficulty = user.rank.difficulty
          }

          // Handle join game against random opponent.
          let gameSessionAvailiable: GameSession | undefined

          for (let i = availiableSessions.length - 1; i >= 0; i--) {
            gameSessionAvailiable = await redisService.getGameSessionObject(availiableSessions[i])
            if (!gameSessionAvailiable) {
              availiableSessions.splice(i, 1)
              continue
            }

            if (gameSessionLogic.handleIsAvailiableSession(gameSessionAvailiable)) {
              availiableSessions.splice(i, 1)
              break
            }

            gameSessionAvailiable = undefined
          }

          if (gameSessionAvailiable) {
            const opponentRandom: Player | undefined = await getOpponentData(
              player.id,
              gameSessionAvailiable
            )
            const opponentRandomWs: WebSocket | undefined = opponentRandom
              ? connections.get(opponentRandom.id)
              : undefined

            await gameSessionLogic.handleJoinSession(
              ws,
              player,
              gameSessionAvailiable,
              opponentRandom,
              opponentRandomWs
            )
            gameSessionLogic.handleStartGame(ws, player, gameSessionAvailiable, opponentRandomWs)
            redisService.setGameSessionData(gameSessionAvailiable)
          } else {
            const newGameSession = gameSessionLogic.handleCreateSession(
              ws,
              player,
              await generateRandomString('gameSession'),
              message.data
            )

            availiableSessions.push(newGameSession.id)
            redisService.setGameSessionData(newGameSession)
          }

          break
        }
        case 'join-game-friend': {
          if (gameSession) {
            await gameSessionLogic.handleJoinSession(ws, player, gameSession, opponent, opponentWs)
            if (gameSession.id !== message.data.id) {
              throw new Error('Failed to join game session. Leave already started game.')
            }
            break
          }

          const gameSessionFriend: GameSession | undefined =
            await redisService.getGameSessionObject(message.data.id)

          gameSessionLogic.handleIsValidFriendSession(player, gameSessionFriend)
          if (!gameSessionFriend) {
            throw new Error(
              'The game session not found. Please recheck if the link is valid and friend is still in the game.'
            )
          }

          const opponentFriend: Player | undefined = await getOpponentData(
            player.id,
            gameSessionFriend
          )
          const opponentFriendWs: WebSocket | undefined = opponentFriend
            ? connections.get(opponentFriend.id)
            : undefined

          await gameSessionLogic.handleJoinSession(
            ws,
            player,
            gameSessionFriend,
            opponentFriend,
            opponentFriendWs
          )
          redisService.setGameSessionData(gameSessionFriend)

          break
        }
        case 'create-game': {
          const newGameSession = gameSessionLogic.handleCreateSession(
            ws,
            player,
            await generateRandomString('gameSession'),
            message.data
          )

          if (message.data && message.data.type === GameSessionType.Computer) {
            gameSessionLogic.handleAddAIPlayer(
              ws,
              newGameSession,
              await generateRandomString('player')
            )
            gameSessionLogic.handleStartGame(ws, player, newGameSession, undefined)
          }

          redisService.setGameSessionData(newGameSession)

          break
        }
        case 'leave-game': {
          await gameSessionLogic.handleLeaveGame(ws, player, gameSession, opponent, opponentWs)
          if (opponent) {
            redisService.setPlayerData(opponent)
          }
          break
        }
        case 'rematch-game': {
          gameSessionLogic.handleRematchGame(ws, player, gameSession, opponent)
          break
        }
        case 'ready': {
          gameSessionLogic.handleReady(ws, player, message.data, gameSession, opponentWs)

          break
        }
      }

      redisService.setPlayerData(player)

      if (gameSession) {
        redisService.setGameSessionData(gameSession)
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
    if (player) {
      connections.delete(player.id)
    }
  })
})

/**
 * Get key from the cookie.
 * @param cookies Cookies from the request header data.
 * @returns Returns value of the key.
 */
function getKeyFromCookies(cookies: string, key: string): string {
  const cookieName = `${key}=`
  try {
    for (const cookie of cookies.split('; ')) {
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
 * Get current opponent data from the game session.
 * @param playerId The identification of the current player.
 * @param gameSession The current game session data.
 * @returns The player object containing opponent data.
 */
async function getOpponentData(
  playerId: string,
  gameSession?: GameSession
): Promise<Player | undefined> {
  if (!gameSession) {
    return undefined
  }

  if (gameSession.playerAI) {
    return gameSession.playerAI
  }

  const opponentId: string | undefined = gameSession
    ? gameSession.player1 === playerId
      ? gameSession.player2
      : gameSession.player1
    : undefined

  if (!opponentId) {
    return undefined
  }

  return await redisService.getPlayerData(opponentId)
}

/**
 * Return randomly generated string and checks if no user or game session is assigned already.
 * @param type The object type that needs a unique ID (eg, player, gameSession).
 * @returns Randomly generated user ID.
 */
async function generateRandomString(type?: string): Promise<string> {
  let ID = Math.random().toString(36).substring(4)
  if (type) {
    while (await redisService.existsData(`${type}:${ID}`)) {
      ID = Math.random().toString(36).substring(4)
    }
  }
  return ID
}
