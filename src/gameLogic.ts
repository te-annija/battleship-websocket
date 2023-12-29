/**
 * FILENAME: gameLogic.ts
 * DESCRIPTION: File contains of responses for requested actions from the user to modify the gameboards.
 * AUTHOR: Annija Karitone
 */

import { WebSocket } from 'ws'
import Player from './models/Player.js'
import GameSession from './models/GameSession.js'
import Ship from './models/Ship.js'
import gameService from './services/BackendService.js'
import * as webScoketHelpers from './helpers/WebSocketHelpers.js'
import GameboardCell from 'models/GameboardCell.js'
import { GameSessionType } from 'enums/GameSessionType.js'
import PlayerAI from 'models/PlayerAI.js'
/**
 * Handle place one ship on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param data The data about the ship that needs to be placed.
 */
export function handlePlaceShip(
  ws: WebSocket,
  player: Player,
  data: any,
  gameSession?: GameSession
): void {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot place ship! Game already started.')
  }

  if (data && data.ship_id && data.position) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id)
    if (ship) {
      player.gameboard.placeShip(ship, data.position)
      webScoketHelpers.sendPlayerData(ws, player)
      return
    }
  }

  throw new Error('Error while placing a ship. Please try again.')
}

/**
 * Hanlde place ships randomly on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 */
export function handleRandomizeShips(
  ws: WebSocket,
  player: Player,
  gameSession?: GameSession
): void {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot randomize ships! Game already started')
  }

  player.gameboard.placeShipsRandomly()
  webScoketHelpers.sendPlayerData(ws, player)
}

/**
 * Handle remove one ship on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param data The data about the ship that needs to be removed.
 * @param gameSession The current gameSession where player is connected.
 */
export function handleRemoveShip(
  ws: WebSocket,
  player: Player,
  data: any,
  gameSession?: GameSession
): void {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot remove ship! Game already started.')
  }

  if (data && data.ship_id) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id)
    if (ship) {
      player.gameboard.cleanBoardOnShip(ship)
      ship.cleanData()
      webScoketHelpers.sendPlayerData(ws, player)
      return
    }
  }

  throw new Error('Error while removing a ship. Please try again.')
}

/**
 * Handle remove all ships from board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 */
export function handleResetShips(ws: WebSocket, player: Player, gameSession?: GameSession): void {
  if (gameSession && gameSession.isGameStarted) {
    throw new Error('Cannot reset ship! Game already started')
  }

  player.gameboard.cleanBoard()
  webScoketHelpers.sendPlayerData(ws, player)
}

/**
 * Handle attack single cell on the enemy gameboard and notify players.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param data The data indicating attack coordinates.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent Current data about the opponent.
 * @param opponentWs Current connection to opponent websocket.
 */
export async function handleAttackCell(
  ws: WebSocket,
  player: Player,
  data: any,
  gameSession?: GameSession,
  opponent?: Player,
  opponentWs?: WebSocket
): Promise<void> {
  // Check if player can attack opponent.
  if (!gameSession) {
    throw new Error('Game is not created. Please create a new game.')
  }

  if (!opponent) {
    player.gameboard.cleanBoard()
    player.attackGameboard.cleanBoard()
    webScoketHelpers.sendAction(ws, 'opponent-disconnected')
    return
  }

  if (gameSession.currentPlayer !== player.id) {
    throw new Error('This is not your turn. Please wait!')
  }

  if (data.row === null || data.col === null) {
    throw new Error('Cannot make an attack. Row and column numbers are required.')
  }

  if (gameSession.winner) {
    throw new Error('Cannot make an attack. The game has already ended.')
  }

  if (processAttack(gameSession, player, opponent, data, ws, opponentWs)) {
    await handleEndOfGame(ws, player, gameSession, opponent, opponentWs)
  }
}

/**
 * Handle computer attack single cell attack on player gameboard and notify player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent Current data about the opponent.
 */
export async function handleAiAttack(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponent: PlayerAI
) {
  const target = opponent.getAttackPosition()
  if (processAttack(gameSession, opponent, player, target, undefined, ws)) {
    await handleEndOfGame(ws, player, gameSession, opponent, undefined)
  }
}

/**
 * Process attack to the gameboard and notify the results.
 * @param gameSession The current gameSession where player is connected.
 * @param player Current data about player.
 * @param opponent Current data about the opponent.
 * @param data The data indicating attack coordinates.
 * @param ws Current connection websocket.
 * @param opponentWs Current connection to opponent websocket.
 * @returns True if attack has been resulted to endgame, false otherwise.
 */
function processAttack(
  gameSession: GameSession,
  player: Player,
  opponent: Player,
  data: any,
  ws?: WebSocket,
  opponentWs?: WebSocket
): boolean {
  // Process attack.
  const attackedCell: GameboardCell = opponent.recieveAttack(data.row, data.col)
  player.saveAttackResult(data.row, data.col, attackedCell)

  if (gameSession.playerAI && gameSession.currentPlayer === gameSession.playerAI.id) {
    gameSession.playerAI.processAfterAttack(data.row, data.col, attackedCell)
  }

  // Notify players about the results.
  if (ws) {
    webScoketHelpers.sendPlayerData(ws, player)
  }

  if (opponentWs) {
    webScoketHelpers.sendPlayerData(opponentWs, opponent)
  }

  // Check if game can be ended.
  if (attackedCell.ship) {
    if (opponent.gameboard.allShipsSunk()) {
      gameSession.winner = player.id
      return true
    }
  } else {
    gameSession.switchPlayer()
  }

  // Notify users about turns.
  if (ws) {
    webScoketHelpers.sendAction(ws, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer === player.id
    })
  }

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer !== player.id
    })
  }

  return false
}

/**
 * Handle end of game logic. Send data to be saved to db and notify users.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent Current data about the opponent.
 * @returns True if game has ended, false otherwise.
 */
export async function handleEndOfGame(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponent?: Player,
  opponentWs?: WebSocket,
  sendGameEnded: boolean = true
): Promise<boolean> {
  if (!gameSession.winner) {
    return false
  }

  const isPlayerWinner = player.id === gameSession.winner

  const gameData = await handleSaveGame(
    gameSession,
    isPlayerWinner ? player : opponent,
    isPlayerWinner ? opponent : player
  )

  // Notify players game ended.
  if (sendGameEnded) {
    webScoketHelpers.sendAction(ws, 'game-ended', {
      isWinner: isPlayerWinner,
      points: isPlayerWinner ? gameData.player1.points : gameData.player2.points
    })
  }

  if (opponent && opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-ended', {
      isWinner: !isPlayerWinner,
      points: !isPlayerWinner ? gameData.player1.points : gameData.player2.points
    })
  }

  // Clean both player gameboards to be reusable.
  gameSession.resetGame()

  player.gameboard.cleanBoard()
  player.attackGameboard.cleanBoard()

  if (opponent) {
    opponent.gameboard.cleanBoard()
    opponent.attackGameboard.cleanBoard()
  }
  return true
}

/**
 *
 * @param player
 * @param gameSession
 * @param opponent
 */
async function handleSaveGame(gameSession: GameSession, winner?: Player, opponent?: Player) {
  const points =
    gameSession.type === GameSessionType.Random
      ? winner && winner.difficulty && opponent && opponent.difficulty
        ? 15 - (winner.difficulty - opponent.difficulty)
        : 15
      : 0

  // Prepare data to sent to server (save in the db).
  let gameData = {
    winnerId: gameSession.winner,
    gameType: gameSession.type,
    player1: {
      userId: winner ? winner.id : '',
      difficulty: winner ? winner.difficulty : '',
      gameboard: winner ? winner.gameboard : '',
      attackGameboard: winner ? winner.attackGameboard : '',
      points: winner ? points : ''
    },
    player2: {
      userId: opponent ? opponent.id : '',
      difficulty: opponent ? opponent.difficulty : '',
      gameboard: opponent ? opponent.gameboard : '',
      attackGameboard: opponent ? opponent.attackGameboard : '',
      points: opponent ? -1 * points : ''
    }
  }

  // Send data to save in the db.
  await gameService.saveGame(gameData)

  return gameData
}
