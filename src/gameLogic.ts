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
 * @param data The data indicating if player is ready to start the game.
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

  // Make an attack and return if it was invalid.
  const attackedCell: GameboardCell = opponent.recieveAttack(data.row, data.col)
  player.saveAttackResult(data.row, data.col, attackedCell)

  // Notify players about the results.
  webScoketHelpers.sendPlayerData(ws, player)

  if (opponent && opponentWs) {
    webScoketHelpers.sendPlayerData(opponentWs, opponent)
  }

  // Check if game can be ended.
  if (attackedCell.ship) {
    if (opponent.gameboard.allShipsSunk()) {
      gameSession.winner = player.id
      handleEndOfGame(ws, player, gameSession, opponent, opponentWs)
      return
    }
  } else {
    gameSession.switchPlayer()
  }

  // Notify users about turns.
  webScoketHelpers.sendAction(ws, 'game-turn', {
    isPlayerTurn: gameSession.currentPlayer === player.id
  })

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer !== player.id
    })
  }

  // AI attack to the player if game is against computer.
  if (gameSession.currentPlayer !== player.id && gameSession.playerAI) {
    while (gameSession.currentPlayer === gameSession.playerAI.id) {
      const target = gameSession.playerAI.getAttackPosition()
      const attackCell: GameboardCell = player.recieveAttack(target.row, target.col)
      gameSession.playerAI.saveAttackResult(target.row, target.col, attackCell)
      gameSession.playerAI.processAfterAttack(target.row, target.col, attackCell)
      await delay(1000)
      webScoketHelpers.sendPlayerData(ws, player)
      // Check if game can be ended.
      if (attackCell.ship) {
        if (player.gameboard.allShipsSunk()) {
          gameSession.winner = gameSession.playerAI.id
          handleEndOfGame(ws, player, gameSession, opponent)
          return
        }
      } else {
        gameSession.switchPlayer()
      }
    }
    webScoketHelpers.sendAction(ws, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer === player.id
    })
  }
}

/**
 * Handle end of game logic. Send data to be saved to db and notify users.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param opponent Current data about the opponent.
 * @returns True if game has ended, false otherwise.
 */
function handleEndOfGame(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  opponent?: Player,
  opponentWs?: WebSocket
): boolean {
  if (!gameSession.winner) {
    return false
  }

  // Prepare data to sent to server (save in the db).
  let gameData = {
    winnerId: 1, // Temporary - should change to registred user id
    gameType: gameSession.type,
    player1: {
      userId: 1, // Temporary - should change to registred user id
      gameboard: player.gameboard,
      attackGameboard: player.attackGameboard
    },
    player2: {}
  }

  if (opponent) {
    gameData.player2 = {
      userId: 2, // Temporary - should change to registred user id
      gameboard: opponent.gameboard,
      attackGameboard: opponent.attackGameboard
    }
  }

  // Send data to save in the db.
  gameService.saveGame(gameData)

  // Notify players game ended.
  webScoketHelpers.sendAction(ws, 'game-ended', { hasWon: player.id === gameSession.winner })

  if (opponent && opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-ended', {
      hasWon: opponent.id === gameSession.winner
    })
  }
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
 * Helper function to timeout the code execution.
 * @param ms Time in miliseconds.
 */
async function delay(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
