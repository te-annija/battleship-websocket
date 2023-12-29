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
import * as webScoketHelpers from './helpers/WebSocketHelpers.js'

const TIMER_DURATION_SECONDS = 90

const serverPort: number = config.has('server.ports') ? config.get('server.ports') : 8080
const wss: WebSocketServer = new WebSocketServer({
  port: serverPort
})

const connections: Map<string, WebSocket> = new Map()
const timers: Map<string, any> = new Map()
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
    if (gameSession && timers.has(gameSession.id)) {
      webScoketHelpers.sendAction(ws, 'timer', { timer: timers.get(gameSession.id).remainingTime })
    }
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
        case 'place-ship': {
          gameLogic.handlePlaceShip(ws, player, message.data, gameSession)
          break
        }
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
          stopTimerForGameSession(gameSession)

          await gameLogic.handleAttackCell(
            ws,
            player,
            message.data,
            gameSession,
            opponent,
            opponentWs
          )

          // AI attack to the player if game is against computer.
          if (gameSession && gameSession.playerAI) {
            while (gameSession.currentPlayer === gameSession.playerAI.id) {
              stopTimerForGameSession(gameSession)
              startTimerForGameSession(ws, player, gameSession, gameSession.playerAI)

              const freshGameSession = await redisService.getGameSessionObject(gameSession.id)
              await delay(2000)

              if (freshGameSession && !freshGameSession.winner && freshGameSession.isGameStarted) {
                await gameLogic.handleAiAttack(ws, player, gameSession, gameSession.playerAI)
                await redisService.setGameSessionData(gameSession)
                stopTimerForGameSession(gameSession)
              } else {
                stopTimerForGameSession(gameSession)
                break
              }
            }
          }

          if (opponent && gameSession) {
            if (!gameSession.playerAI) {
              redisService.setPlayerData(opponent)
            }

            if (gameSession.isGameStarted) {
              startTimerForGameSession(ws, player, gameSession, opponent, opponentWs)
            }
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
            if (opponentRandom) {
              startTimerForGameSession(
                ws,
                player,
                gameSessionAvailiable,
                opponentRandom,
                opponentRandomWs
              )
            }
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
            if (newGameSession.playerAI) {
              startTimerForGameSession(ws, player, newGameSession, newGameSession.playerAI)
            }
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
          const isGameStarted = gameSessionLogic.handleReady(
            ws,
            player,
            message.data,
            gameSession,
            opponentWs
          )

          if (isGameStarted && gameSession) {
            if (gameSession.type === GameSessionType.Computer && gameSession.playerAI) {
              startTimerForGameSession(ws, player, gameSession, gameSession.playerAI)
              break
            } else if (opponent) {
              startTimerForGameSession(ws, player, gameSession, opponent, opponentWs)
              break
            }
            gameSessionLogic.handleLeaveGame(ws, player, gameSession, opponent, opponentWs)
          }
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

/**
 * Handle timer for players turns and handle game end logic if timer has expired.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent Current data about the opponent.
 * @param opponentWs Current connection to opponent websocket.
 */
function startTimerForGameSession(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponent: Player,
  opponentWs?: WebSocket
): void {
  let timer = TIMER_DURATION_SECONDS

  webScoketHelpers.sendAction(ws, 'timer', { timer: timer })
  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'timer', { timer: timer })
  }

  const interval = setInterval(async () => {
    if (timer === 0) {
      clearInterval(timers.get(gameSession.id).interval)
      timers.delete(gameSession.id)
      webScoketHelpers.sendAction(ws, 'timer-ended', { timer: timer })
      if (opponentWs) {
        webScoketHelpers.sendAction(opponentWs, 'timer-ended', { timer: timer })
      }
      const freshGameSession = await redisService.getGameSessionObject(gameSession.id)

      if (freshGameSession && freshGameSession.isGameStarted) {
        freshGameSession.winner = gameSession.currentPlayer === player.id ? opponent.id : player.id
        await gameLogic.handleEndOfGame(ws, player, freshGameSession, opponent, opponentWs)

        redisService.setGameSessionData(freshGameSession)
        redisService.setPlayerData(player)
        redisService.setPlayerData(opponent)
      }
    }
    timer--
    timers.set(gameSession.id, { interval, remainingTime: timer })
  }, 1000)

  timers.set(gameSession.id, { interval, remainingTime: timer })
}

/**
 * Removes timer from the game session.
 * @param gameSession The current gameSession where player is connected.
 */
function stopTimerForGameSession(gameSession?: GameSession): void {
  if (gameSession && timers.has(gameSession.id)) {
    clearInterval(timers.get(gameSession.id).interval)
    timers.delete(gameSession.id)
  }
}

/**
 * Helper function to timeout the code execution.
 * @param ms Time in miliseconds.
 */
async function delay(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
