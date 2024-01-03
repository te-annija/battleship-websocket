/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import GameSession from './models/GameSession.js'
import Player from './models/Player.js'
import * as gameLogic from './gameLogic.js'
import * as gameSessionLogic from './gameSessionLogic.js'
import redisService from './services/RedisService.js'
import { GameSessionType } from 'enums/GameSessionType.js'
import backendService from './services/BackendService.js'
import * as webScoketHelpers from './helpers/WebSocketHelpers.js'
import PlayerComputer from './models/PlayerComputer.js'
import 'dotenv/config'

const TIMER_DURATION_SECONDS = 90 // Timer for max allowed turn time in the game.
const SERVER_PORT: number = Number(process.env.PORT) || 3000

const wss: WebSocketServer = new WebSocketServer({ port: SERVER_PORT }) //WebSocket Server setup

const connections: Map<string, WebSocket> = new Map() // Stores all connected user connections.
const timers: Map<string, any> = new Map() // Stores all timers used for taking turns in the game.
const availiableSessions: string[] = [] // Stores all game sessions that are waiting for the opponent.

/**
 * Websocket server connection
 */
wss.on('connection', async (ws: WebSocket) => {
  console.log('A player connected')

  let player: Player | undefined

  // Handle WebSocket messages
  ws.on('message', async (data: string) => {
    console.log('received: %s', data)

    try {
      const message: any = JSON.parse(data)

      if (!player) {
        if (message.type === 'init-player') {
          // Handle Player initial data
          const user: any = await backendService.getUserData(message.data.token)

          const playerId: string =
            user && user.username
              ? user.username
              : message.data.playerId
              ? message.data.playerId
              : await generateRandomString('player')

          player = await redisService.getPlayer(playerId)
          connections.set(playerId, ws)

          if (!player) {
            // New user session.
            const playerUsername: string = user ? user.username : `player-${playerId}`
            player = new Player(playerId, playerUsername)
            if (user) {
              player.difficulty = user.rank.difficulty
            }
            await redisService.setPlayer(player)
          }

          // Join user game session if exists.
          const gameSession: GameSession | undefined = player.gameSessionId
            ? await redisService.getGameSession(player.gameSessionId)
            : undefined

          const opponent: Player | undefined = await getOpponentData(player.playerId, gameSession)

          await gameSessionLogic.handlePlayerSessionStart(ws, player, gameSession, opponent)

          if (gameSession && timers.has(gameSession.gameSessionId)) {
            webScoketHelpers.sendAction(ws, 'timer', {
              timer: timers.get(gameSession.gameSessionId).remainingTime
            })
          }
        } else {
          ws.close()
        }

        return
      } else {
        // Fetch new player data if changed in opponent WebSocket session
        player = await redisService.getPlayer(player.playerId)
      }

      if (!player) {
        ws.close()
        return
      }

      let gameSession: GameSession | undefined = player.gameSessionId
        ? await redisService.getGameSession(player.gameSessionId)
        : undefined

      const opponentId: string | undefined = gameSession
        ? gameSession.player1 === player.playerId
          ? gameSession.player2
          : gameSession.player1
        : undefined

      const opponentWs: WebSocket | undefined = opponentId ? connections.get(opponentId) : undefined

      switch (message.type) {
        case 'place-ship': {
          disallowIfGameStarted(gameSession)
          await gameLogic.handlePlaceShip(ws, player, message.data)
          break
        }
        case 'randomize-ships':
          disallowIfGameStarted(gameSession)
          await gameLogic.handleRandomizeShips(ws, player)
          break
        case 'remove-ship':
          disallowIfGameStarted(gameSession)
          await gameLogic.handleRemoveShip(ws, player, message.data)
          break
        case 'reset-ships':
          disallowIfGameStarted(gameSession)
          await gameLogic.handleResetShips(ws, player)
          break
        case 'attack-cell': {
          stopTimerForGameSession(gameSession)
          const opponent: Player | PlayerComputer | undefined = await getOpponentData(
            player.playerId,
            gameSession
          )

          await gameLogic.handleAttackCell(
            ws,
            player,
            message.data,
            gameSession,
            opponent,
            opponentWs
          )

          // AI attack to the player if game is against computer.
          if (gameSession && opponent instanceof PlayerComputer) {
            while (gameSession.currentPlayer === opponent.playerId) {
              stopTimerForGameSession(gameSession)
              startTimerForGameSession(ws, player, gameSession, opponent)

              const freshGameSession = await redisService.getGameSession(gameSession.gameSessionId)
              await delay(2000)

              if (freshGameSession && !freshGameSession.winner && freshGameSession.isGameStarted) {
                await gameLogic.handleAiAttack(ws, player, gameSession, opponent)
                await redisService.setGameSession(gameSession)
                stopTimerForGameSession(gameSession)
              } else {
                stopTimerForGameSession(gameSession)
                break
              }
            }
          }

          if (opponent && gameSession && gameSession.isGameStarted) {
            startTimerForGameSession(ws, player, gameSession, opponent, opponentWs)
          }

          break
        }
        case 'join-game-online': {
          disallowIfShipsNotPlaced(player)
          const user: any = await backendService.getUserData(message.data.token)
          if (user) {
            player.difficulty = user.rank.difficulty
          }

          gameSession = await gameSessionLogic.getAvailiableGameSession(player, availiableSessions)

          /**
           * Helper function to handle game session finding retries.
           * @param player Current data about the player
           * @param initialGameSessionId The identification of the created game session where player waits.
           * @param modifier The difficulty modifier to expand search.
           */
          const waitAndRetry = async (
            player: Player,
            initialGameSessionId: string,
            modifier: number = 0
          ) => {
            await delay(5000)
            const initialGameSession: GameSession | undefined =
              await redisService.getGameSession(initialGameSessionId)
            if (
              ws.readyState !== WebSocket.OPEN ||
              !initialGameSession ||
              initialGameSession.player2 ||
              initialGameSession.isGameStarted ||
              !initialGameSession.player1
            ) {
              return // If WebSocket is closed, terminate the retry loop
            }
            const gameSession = await gameSessionLogic.getAvailiableGameSession(
              player,
              availiableSessions,
              modifier
            )

            if (gameSession) {
              if (initialGameSession) {
                await redisService.deleteGameSession(initialGameSession.gameSessionId)
                player.gameSessionId = undefined
              }
              await handleJoinGameOnline(player, gameSession)
            } else if (player.difficulty) {
              await waitAndRetry(player, initialGameSessionId, modifier + 1)
            }
          }

          /**
           * Helper function to join user in the found game session.
           * @param player The current data about the player.
           * @param gameSession The found game session data.
           */
          const handleJoinGameOnline = async (player: Player, gameSession: GameSession) => {
            const opponent: Player | undefined = await getOpponentData(player.playerId, gameSession)
            const opponentWs: WebSocket | undefined = opponent
              ? connections.get(opponent.playerId)
              : undefined

            gameSessionLogic.handleJoinSession(ws, player, gameSession, opponent, opponentWs)
            gameSessionLogic.handleStartGame(ws, player, gameSession, opponentWs)

            if (opponent) {
              startTimerForGameSession(ws, player, gameSession, opponent, opponentWs)
            }

            await redisService.setPlayer(player)
            await redisService.setGameSession(gameSession)
          }

          if (!gameSession) {
            gameSession = gameSessionLogic.handleCreateSession(
              ws,
              player,
              await generateRandomString('gameSession'),
              message.data
            )
            availiableSessions.push(gameSession.gameSessionId)
            await redisService.setPlayer(player)
            await redisService.setGameSession(gameSession)
            /**Save to redis */
            waitAndRetry(player, gameSession.gameSessionId)
          } else {
            await handleJoinGameOnline(player, gameSession)
          }
          break
        }
        case 'join-game-friend': {
          gameSession = await gameSessionLogic.getFriendGameSession(player, message.data)

          const opponent: Player | undefined = await getOpponentData(player.playerId, gameSession)
          const opponentWs: WebSocket | undefined = opponent
            ? connections.get(opponent.playerId)
            : undefined

          await gameSessionLogic.handleJoinSession(ws, player, gameSession, opponent, opponentWs)
          break
        }
        case 'create-game': {
          disallowIfShipsNotPlaced(player)
          gameSession = gameSessionLogic.handleCreateSession(
            ws,
            player,
            await generateRandomString('gameSession'),
            message.data
          )

          if (message.data && message.data.type === GameSessionType.Computer) {
            const opponent: PlayerComputer = await gameSessionLogic.handleAddPlayerComputer(
              ws,
              gameSession,
              await generateRandomString('player')
            )
            gameSessionLogic.handleStartGame(ws, player, gameSession, undefined)
            startTimerForGameSession(ws, player, gameSession, opponent)
          }
          break
        }
        case 'leave-game': {
          const opponent: Player | undefined = await getOpponentData(player.playerId, gameSession)
          await gameSessionLogic.handleLeaveGame(ws, player, gameSession, opponent, opponentWs)
          break
        }
        case 'rematch-game': {
          gameSessionLogic.handleRematchGame(ws, player, gameSession)
          break
        }
        case 'ready': {
          disallowIfShipsNotPlaced(player)
          stopTimerForGameSession(gameSession)

          const opponent: Player | PlayerComputer | undefined = await getOpponentData(
            player.playerId,
            gameSession
          )
          const isGameStarted = gameSessionLogic.handleReady(
            ws,
            player,
            message.data,
            opponent,
            gameSession,
            opponentWs
          )

          if (isGameStarted && gameSession) {
            const opponent: Player | PlayerComputer | undefined = await getOpponentData(
              player.playerId,
              gameSession
            )
            if (opponent) {
              startTimerForGameSession(ws, player, gameSession, opponent, opponentWs)
            } else {
              gameSessionLogic.handleLeaveGame(ws, player, gameSession)
            }
          }
          break
        }
      }

      redisService.setPlayer(player)

      if (gameSession) {
        if (!gameSession.player1 && !gameSession.player2) {
          redisService.deleteGameSession(gameSession.gameSessionId)
        } else {
          redisService.setGameSession(gameSession)
        }
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
  ws.on('close', async () => {
    console.log('A player disconnected')
    if (player) {
      if (player.gameSessionId) {
        const gameSession = await redisService.getGameSession(player.gameSessionId)
        if (
          gameSession &&
          (!gameSession.player1 || !gameSession.player2) &&
          gameSession.type === GameSessionType.Online
        ) {
          player.gameSessionId = undefined
          redisService.deleteGameSession(gameSession.gameSessionId)
        }
      }
      connections.delete(player.playerId)
    }
  })
})

/**
 * Get current opponent data from the game session.
 * @param playerId The identification of the current player.
 * @param gameSession The current game session data.
 * @returns The player object containing opponent data.
 */
async function getOpponentData(
  playerId: string,
  gameSession?: GameSession
): Promise<Player | PlayerComputer | undefined> {
  if (!gameSession) {
    return undefined
  }

  if (gameSession.type === GameSessionType.Computer && gameSession.player2) {
    return await redisService.getPlayerComputer(gameSession.player2)
  }

  const opponentId: string | undefined = gameSession
    ? gameSession.player1 === playerId
      ? gameSession.player2
      : gameSession.player1
    : undefined

  if (!opponentId) {
    return undefined
  }

  return await redisService.getPlayer(opponentId)
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
      clearInterval(timers.get(gameSession.gameSessionId).interval)
      timers.delete(gameSession.gameSessionId)
      webScoketHelpers.sendAction(ws, 'timer-ended', { timer: timer })
      if (opponentWs) {
        webScoketHelpers.sendAction(opponentWs, 'timer-ended', { timer: timer })
      }
      const freshGameSession = await redisService.getGameSession(gameSession.gameSessionId)

      if (freshGameSession && freshGameSession.isGameStarted && !freshGameSession.winner) {
        console.log(`Timer went off ${freshGameSession.gameSessionId}`)
        freshGameSession.winner =
          gameSession.currentPlayer === player.playerId ? opponent.playerId : player.playerId
        await gameLogic.handleEndOfGame(ws, player, freshGameSession, opponent, opponentWs)

        redisService.setGameSession(freshGameSession)
        redisService.setPlayer(player)
        redisService.setPlayer(opponent)
      }
    }
    timer--
    timers.set(gameSession.gameSessionId, { interval, remainingTime: timer })
  }, 1000)

  timers.set(gameSession.gameSessionId, { interval, remainingTime: timer })
}

/**
 * Removes timer from the game session.
 * @param gameSession The current gameSession where player is connected.
 */
function stopTimerForGameSession(gameSession?: GameSession): void {
  if (gameSession && timers.has(gameSession.gameSessionId)) {
    clearInterval(timers.get(gameSession.gameSessionId).interval)
    timers.delete(gameSession.gameSessionId)
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

/**
 * Helper function to disallow modifying grid if game is already started.
 * @param gameSession The current game session data.
 */
function disallowIfGameStarted(gameSession?: GameSession) {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot modify ships! Game already started')
  }
}

/**
 * Helper function to disallow staring game if ships is not placed.
 * @param player The current player data.
 */
async function disallowIfShipsNotPlaced(player: Player) {
  const gameboard = await redisService.getGameboard(player.playerId)
  if (!gameboard.isAllShipsOnBoard()) {
    throw new Error('Cannot start the game! All ships needs to be placed')
  }
}
