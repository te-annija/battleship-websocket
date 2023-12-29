/**
 * FILENAME: gameSessionLogic.ts
 * DESCRIPTION: File contains of responses for requested actions from the user to create/join/leave the game session.
 * AUTHOR: Annija Karitone
 */

import { WebSocket } from 'ws'
import GameSession from './models/GameSession.js'
import Player from './models/Player'
import PlayerAI from './models/PlayerAI.js'
import * as webScoketHelpers from './helpers/WebSocketHelpers.js'
import { GameSessionType } from './enums/GameSessionType'
import { handleEndOfGame } from './gameLogic.js'

/**
 * Handle the player data if existing session needs to be restored.
 *
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
  const isReady = gameSession ? gameSession.ready.get(player.id) === true : false

  webScoketHelpers.sendPlayerData(ws, player, isReady)
  if (gameSession) {
    if (opponent) {
      webScoketHelpers.sendOpponentData(ws, opponent, gameSession.ready.get(opponent.id) === true)
    }

    if (gameSession.isGameStarted) {
      webScoketHelpers.sendAction(ws, 'game-started')
      webScoketHelpers.sendAction(ws, 'game-turn', {
        isPlayerTurn: gameSession.currentPlayer === player.id
      })

      if (!opponent) {
        webScoketHelpers.sendAction(ws, 'opponent-disconnected')
      }
    } else {
      try {
        await handleJoinSession(ws, player, gameSession, opponent)
      } catch (error: any) {
        player.gameSessionId = undefined
      }
    }
  }
}

/**
 * Handle joining to already created gameSession and updating opponent data.
 *
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
  if (player.gameSessionId && gameSession.id !== player.gameSessionId) {
    throw new Error('Failed to join the gameSession. Leave already started game first.')
  }

  if (!gameSession.player1) {
    throw new Error('Failed to join the gameSession. Host disconnected.')
  }

  player.gameSessionId = gameSession.id
  webScoketHelpers.sendAction(ws, 'player-joined')

  if (gameSession.player1 !== player.id) {
    // Player that is not the host is joining or rejoining the gameSession.
    gameSession.player2 = player.id
  }

  if (opponent) {
    webScoketHelpers.sendOpponentData(ws, opponent, gameSession.ready.get(opponent.id) === true)

    if (opponentWs) {
      // Notify the opponent that the player is joined.
      webScoketHelpers.sendOpponentData(
        opponentWs,
        player,
        gameSession.ready.get(player.id) === true
      )
    }
  }
}

/**
 * Handle creating a gameSession where player will be the host.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSessionId The unique identifier for the new gameSession.
 * @param data Data indicating the requested gameSession type (eg., 'random', 'friend', 'computer').
 */
export function handleCreateSession(
  ws: WebSocket,
  player: Player,
  gameSessionId: string,
  data: any
): GameSession {
  if (!player.gameboard.isAllShipsOnBoard()) {
    throw new Error('Place ships before starting a new game.')
  }

  const sessionType = data && data.type ? data.type : GameSessionType.Computer
  const newgameSession = new GameSession(gameSessionId, sessionType, player.id)
  player.gameSessionId = newgameSession.id
  webScoketHelpers.sendAction(ws, 'game-created', { id: newgameSession.id, type: sessionType })
  if (sessionType !== GameSessionType.Computer) {
    webScoketHelpers.sendAction(ws, 'player-joined')
  }

  return newgameSession
}

/**
 * Validates and returs if friend game session is found and valid.
 * @param player Current data about player.
 * @param data Data containing friend game session information.
 * @returns Friend game session if found.
 */
export function handleIsValidFriendSession(player: Player, gameSession?: GameSession): boolean {
  if (!gameSession) {
    throw new Error(
      'The game session not found. Please recheck if the link is valid and friend is still in the game.'
    )
  }

  if (gameSession.player2 && gameSession.player2 !== player.id) {
    throw new Error('Failed to join the game session. The session is already full.')
  }

  if (gameSession.type !== GameSessionType.Friend) {
    throw new Error('Failed to join the game session. Not allowed.')
  }

  return true
}

/**
 * Validates if player can join random game session.
 * @param gameSession The potential random game session of a player.
 * @returns True if game session can be used.
 */
export function handleIsAvailiableSession(gameSession: GameSession): boolean {
  if (gameSession.player1 && gameSession.player2) {
    return false
  }

  if (!gameSession.player1) {
    return false
  }

  if (gameSession.type !== GameSessionType.Random) {
    return false
  }

  return true
}

/**
 * Handle game start request and notify players about turns.
 *
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
  if (gameSession.type === GameSessionType.Friend && !gameSession.isReady()) {
    throw new Error('Cannot start the game. All players are not ready yet!')
  }

  if (!player.gameboard.isAllShipsOnBoard) {
    throw new Error('Cannot start the game. All ships are not placed.')
  }

  gameSession.isGameStarted = true
  if (gameSession.player1 && gameSession.player2) {
    gameSession.currentPlayer = Math.random() < 0.5 ? gameSession.player1 : gameSession.player2 //Choose player to start randomly
  }
  if (gameSession.playerAI) {
    gameSession.currentPlayer = player.id
  }

  webScoketHelpers.sendAction(ws, 'game-turn', {
    isPlayerTurn: gameSession.currentPlayer === player.id
  })
  webScoketHelpers.sendAction(ws, 'game-started')

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer !== player.id
    })

    webScoketHelpers.sendAction(opponentWs, 'game-started')
  }
}

/**
 * Handle add AI player if the game is against the computer.
 *
 * @param ws Current connection websocket.
 * @param gameSession The current gameSession where player is connected.
 * @param PlayerAIId The unique identifier for the AI.
 */
export function handleAddAIPlayer(
  ws: WebSocket,
  gameSession: GameSession,
  PlayerAIId: string
): void {
  if (gameSession.type === GameSessionType.Computer) {
    gameSession.playerAI = new PlayerAI(PlayerAIId)
    gameSession.setPlayerReadyStatus(gameSession.playerAI.id, true)
    webScoketHelpers.sendOpponentData(ws, gameSession.playerAI, true)
  }
}

/**
 * Handle game leave, clean up data and notify players.
 *
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
      gameSession.winner = opponent.id
      await handleEndOfGame(ws, player, gameSession, opponent, opponentWs, false)
      gameSession.player1 = undefined
      gameSession.player2 = undefined
    }

    if (gameSession.player1 && gameSession.player1 === player.id) {
      gameSession.player1 = undefined
    } else {
      gameSession.player2 = undefined
    }

    player.gameSessionId = undefined
  }

  webScoketHelpers.sendPlayerData(ws, player)

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'opponent-disconnected')

    if (gameSession && !gameSession.player1 && !gameSession.isGameStarted) {
      webScoketHelpers.sendAction(opponentWs, 'host-disconnected')
    }
  }
}

/**
 * Handle request to play again in the same game session.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param opponent Current data about the opponent.
 */
export function handleRematchGame(
  ws: WebSocket,
  player: Player,
  gameSession?: GameSession,
  opponent?: Player
) {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot rematch the game! Game is not ended.')
  }

  if (!gameSession || (!opponent && gameSession.type !== GameSessionType.Computer)) {
    webScoketHelpers.sendAction(ws, 'opponent-disconnected')
    return
  }

  player.gameboard.cleanBoard()
  player.attackGameboard.cleanBoard()
  webScoketHelpers.sendPlayerData(ws, player)
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
  gameSession?: GameSession,
  opponentWs?: WebSocket
): boolean {
  if (!gameSession || !data) {
    throw new Error('Could not change ready status')
  }

  gameSession.setPlayerReadyStatus(player.id, data.status)

  if (opponentWs) {
    webScoketHelpers.sendOpponentData(opponentWs, player, data.status)

    if (gameSession.isReady()) {
      // Both players are ready, start the game
      handleStartGame(ws, player, gameSession, opponentWs)
      return true
    }
  }

  if (gameSession.type === GameSessionType.Computer && gameSession.playerAI) {
    handleAddAIPlayer(ws, gameSession, gameSession.playerAI.id)
    handleStartGame(ws, player, gameSession)
    return true
  }

  return false
}
