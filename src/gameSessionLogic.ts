/**
 * FILENAME: gameSessionLogic.ts
 * DESCRIPTION: File contains of responses for requested actions from the user to create/join/leave the game session.
 * AUTHOR: Annija Karitone
 */

import { WebSocket } from 'ws'
import GameSession from './models/GameSession.js'
import Player from './models/Player'
import PlayerComputer from './models/PlayerComputer.js'
import * as webScoketHelpers from './helpers/WebSocketHelpers.js'
import { GameSessionType } from './enums/GameSessionType'
import { handleEndOfGame } from './gameLogic.js'
import Gameboard from './models/Gameboard.js'
import redisService from './services/RedisService.js'

/**
 * Handle the player data if existing session needs to be restored.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent The current data about the opponent.
 */
export async function handlePlayerSessionStart(
  ws: WebSocket,
  player: Player,
  gameSession?: GameSession,
  opponent?: Player
) {
  try {
    const gameboard: Gameboard = await redisService.getGameboard(player.playerId)
    const attackGameboard: Gameboard = await redisService.getGameboard(player.playerId, 'attack')
    webScoketHelpers.sendGameboardData(ws, gameboard)
    webScoketHelpers.sendGameboardData(ws, attackGameboard, 'attack')
  } catch (error: any) {
    const newGameboard = new Gameboard()
    await redisService.setGameboard(player.playerId, newGameboard)
    await redisService.setGameboard(player.playerId, newGameboard, 'attack')
    webScoketHelpers.sendGameboardData(ws, newGameboard)
    webScoketHelpers.sendGameboardData(ws, newGameboard, 'attack')
  }
  webScoketHelpers.sendPlayerData(ws, player)

  if (gameSession) {
    if (opponent) {
      webScoketHelpers.sendOpponentData(ws, opponent)
    }

    if (gameSession.isGameStarted) {
      webScoketHelpers.sendAction(ws, 'game-started')
      webScoketHelpers.sendAction(ws, 'game-turn', {
        isPlayerTurn: gameSession.currentPlayer === player.playerId
      })

      if (!opponent) {
        webScoketHelpers.sendAction(ws, 'opponent-disconnected')
      }
    } else {
      try {
        if (gameSession.type == GameSessionType.Friend && !opponent) {
          webScoketHelpers.sendAction(ws, 'game-created', {
            gameSessionId: gameSession.gameSessionId,
            type: gameSession.type
          })
        } else {
          await handleJoinSession(ws, player, gameSession, opponent)
        }
      } catch (error: any) {
        player.gameSessionId = undefined
      }
    }
  }
}

/**
 * Handle joining to already created gameSession and updating opponent data.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent The current data about the opponent.
 * @param opponentWs Current connection to opponent websocket.
 */
export function handleJoinSession(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponent?: Player,
  opponentWs?: WebSocket
): void {
  if (player.gameSessionId && gameSession.gameSessionId !== player.gameSessionId) {
    throw new Error('Failed to join the game session. Leave already started game first.')
  }

  if (!gameSession.player1) {
    throw new Error('Failed to join the game session. Host disconnected.')
  }

  player.gameSessionId = gameSession.gameSessionId
  webScoketHelpers.sendAction(ws, 'player-joined')

  if (gameSession.player1 !== player.playerId) {
    // Player that is not the host is joining or rejoining the gameSession.
    gameSession.player2 = player.playerId
  }

  webScoketHelpers.sendPlayerData(ws, player)
  if (opponent) {
    webScoketHelpers.sendOpponentData(ws, opponent)

    if (opponentWs) {
      // Notify the opponent that the player is joined.
      webScoketHelpers.sendOpponentData(opponentWs, player)
    }
  }
}

/**
 * Handle creating a gameSession where player will be the host.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSessionId The unique identifier for the new gameSession.
 * @param data Data indicating the requested gameSession type (eg., 'online', 'friend', 'computer').
 */
export function handleCreateSession(
  ws: WebSocket,
  player: Player,
  gameSessionId: string,
  data: any
): GameSession {
  const sessionType = data && data.type ? data.type : GameSessionType.Computer
  const gameSession = new GameSession(gameSessionId, sessionType, player.playerId)
  player.gameSessionId = gameSession.gameSessionId
  player.isReady = false
  webScoketHelpers.sendAction(ws, 'game-created', {
    gameSessionId: gameSession.gameSessionId,
    type: sessionType
  })
  if (sessionType !== GameSessionType.Computer) {
    webScoketHelpers.sendAction(ws, 'player-joined')
  }
  webScoketHelpers.sendPlayerData(ws, player)

  return gameSession
}

/**
 * Returns friend game session if found and valid.
 * @param player Current data about player.
 * @param data Data containing friend game session information.
 * @returns Friend game session with given identifator.
 */
export async function getFriendGameSession(player: Player, data: any): Promise<GameSession> {
  const gameSession: GameSession | undefined = await redisService.getGameSession(data.gameSessionId)
  if (!gameSession) {
    throw new Error(
      'The game session not found. Please recheck if the link is valid and friend is still in the game.'
    )
  }

  if (
    gameSession.player2 &&
    gameSession.player2 !== player.playerId &&
    gameSession.player1 !== player.playerId
  ) {
    throw new Error('Failed to join the game session. The session is already full.')
  }

  if (gameSession.type !== GameSessionType.Friend) {
    throw new Error('Failed to join the game session. Not allowed.')
  }

  return gameSession
}

/**
 * Returns valid avaliable game session if exists.
 * @param player Current data about player.
 * @param availiableSessions Data containing avaliable sessions.
 * @returns Online game session if found.
 */
export async function getAvailiableGameSession(
  player: Player,
  availiableSessions: string[],
  modifier: number = 0
): Promise<GameSession | undefined> {
  for (let i = availiableSessions.length - 1; i >= 0; i--) {
    const gameSession: GameSession | undefined = await redisService.getGameSession(
      availiableSessions[i]
    )

    // Remove invalid game sessions from the list.
    if (!gameSession || (gameSession.player1 && gameSession.player2) || !gameSession.player1) {
      availiableSessions.splice(i, 1)
      continue
    }

    if (gameSession.player1 === player.playerId) {
      continue
    }
    const opponent: Player | undefined = await redisService.getPlayer(gameSession.player1)

    if (!opponent) {
      availiableSessions.splice(i, 1)
      continue
    }

    if (
      (!opponent.difficulty && !player.difficulty) ||
      (player.difficulty &&
        opponent.difficulty &&
        player.difficulty + modifier >= opponent.difficulty &&
        player.difficulty - modifier <= opponent.difficulty)
    ) {
      availiableSessions.splice(i, 1)
      return gameSession
    }
  }
  return undefined
}

/**
 * Handle game start request and notify players about turns.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponentWs Current connection to opponent websocket.
 */
export function handleStartGame(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponentWs?: WebSocket
) {
  gameSession.isGameStarted = true
  if (gameSession.player1 && gameSession.player2) {
    gameSession.currentPlayer = Math.random() < 0.5 ? gameSession.player1 : gameSession.player2 //Choose player to start randomly
  }
  if (gameSession.type === GameSessionType.Computer) {
    gameSession.currentPlayer = player.playerId
  }

  webScoketHelpers.sendAction(ws, 'game-turn', {
    isPlayerTurn: gameSession.currentPlayer === player.playerId
  })
  webScoketHelpers.sendAction(ws, 'game-started')

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer !== player.playerId
    })

    webScoketHelpers.sendAction(opponentWs, 'game-started')
  }
}

/**
 * Handle add computer player if the game is against the computer.
 * @param ws Current connection websocket.
 * @param gameSession The current gameSession where player is connected.
 * @param playerId The unique identifier for the computer player.
 */
export async function handleAddPlayerComputer(
  ws: WebSocket,
  gameSession: GameSession,
  playerId: string
): Promise<PlayerComputer> {
  const playerComputer: PlayerComputer = new PlayerComputer(playerId)
  gameSession.player2 = playerId

  await redisService.setPlayer(playerComputer)

  const newGameboard = new Gameboard()
  await redisService.setGameboard(playerId, newGameboard, 'attack')
  newGameboard.placeShipsRandomly()
  await redisService.setGameboard(playerId, newGameboard)

  webScoketHelpers.sendOpponentData(ws, playerComputer)
  return playerComputer
}

/**
 * Handle game leave, clean up data and notify players.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent The current data about the opponent.
 * @param opponentWs Current connection to opponent websocket.
 */
export async function handleLeaveGame(
  ws: WebSocket,
  player: Player,
  gameSession?: GameSession,
  opponent?: Player,
  opponentWs?: WebSocket
): Promise<void> {
  if (gameSession) {
    if (gameSession.isGameStarted && opponent) {
      gameSession.winner = opponent.playerId
      await handleEndOfGame(ws, player, gameSession, opponent, opponentWs, false)
      gameSession.player1 = undefined
      gameSession.player2 = undefined
    }

    if (gameSession.player1 && gameSession.player1 === player.playerId) {
      gameSession.player1 = undefined
    } else {
      gameSession.player2 = undefined
    }

    if (gameSession.type === GameSessionType.Computer && opponent) {
      await redisService.deletePlayer(opponent.playerId)
      gameSession.player2 = undefined
    }

    player.gameSessionId = undefined
  }

  player.isReady = false
  await redisService.setPlayer(player)
  webScoketHelpers.sendGameboardData(ws, new Gameboard())
  webScoketHelpers.sendGameboardData(ws, new Gameboard(), 'attack')

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'opponent-disconnected')

    if (gameSession && !gameSession.player1 && !gameSession.isGameStarted) {
      webScoketHelpers.sendAction(opponentWs, 'host-disconnected')
    }
  }
}

/**
 * Handle request to play again in the same game session.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 */
export async function handleRematchGame(ws: WebSocket, player: Player, gameSession?: GameSession) {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot rematch the game! Game is not ended.')
  }

  if (!gameSession || !gameSession.player1 || !gameSession.player2) {
    webScoketHelpers.sendAction(ws, 'opponent-disconnected')
    return
  }

  webScoketHelpers.sendGameboardData(ws, await redisService.getGameboard(player.playerId))
  webScoketHelpers.sendGameboardData(
    ws,
    await redisService.getGameboard(player.playerId, 'attack'),
    'attack'
  )
}

/**
 * Handle ready to start the game for friend gameSession.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param data The data indicating if player is ready to start the game.
 * @param gameSession The current gameSession where player is connected.
 * @param opponentWs Current connection to opponent websocket.
 * @returns True if both players are ready, false otherwise.
 */
export function handleReady(
  ws: WebSocket,
  player: Player,
  data: any,
  opponent?: Player,
  gameSession?: GameSession,
  opponentWs?: WebSocket
): boolean {
  if (!gameSession || !data || !opponent) {
    throw new Error('Could not change ready status')
  }

  player.isReady = data.status

  if (opponentWs) {
    webScoketHelpers.sendOpponentData(opponentWs, player)

    if (data.status && opponent.isReady) {
      // Both players are ready, start the game
      handleStartGame(ws, player, gameSession, opponentWs)
      return true
    }
  }

  if (gameSession.type === GameSessionType.Computer && gameSession.player2) {
    handleAddPlayerComputer(ws, gameSession, gameSession.player2)
    handleStartGame(ws, player, gameSession)
    return true
  }

  return false
}
