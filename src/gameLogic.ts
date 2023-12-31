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
import GameboardCell from './models/GameboardCell.js'
import { GameSessionType } from 'enums/GameSessionType.js'
import PlayerComputer from './models/PlayerComputer.js'
import Gameboard from './models/Gameboard.js'
import redisService from './services/RedisService.js'

/**
 * Handle place one ship on board and update the player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param data The data about the ship that needs to be placed.
 */
export async function handlePlaceShip(ws: WebSocket, player: Player, data: any): Promise<void> {
  const gameboard: Gameboard = await redisService.getGameboard(player.id)

  if (data && data.shipId && data.position) {
    const ship: Ship | undefined = gameboard.getShipById(data.shipId)
    if (ship) {
      gameboard.placeShip(ship, data.position)
      webScoketHelpers.sendGameboardData(ws, gameboard)
      await redisService.setGameboard(player.id, gameboard)
      return
    }
  }

  throw new Error('Error while placing a ship. Please try again.')
}

/**
 * Hanlde place ships randomly on board and update the player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 */
export async function handleRandomizeShips(ws: WebSocket, player: Player): Promise<void> {
  const gameboard: Gameboard = await redisService.getGameboard(player.id)

  gameboard.placeShipsRandomly()
  webScoketHelpers.sendGameboardData(ws, gameboard)
  await redisService.setGameboard(player.id, gameboard)
}

/**
 * Handle remove one ship on board and update the player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param data The data about the ship that needs to be removed.
 */
export async function handleRemoveShip(ws: WebSocket, player: Player, data: any): Promise<void> {
  const gameboard: Gameboard = await redisService.getGameboard(player.id)

  if (data && data.shipId) {
    const ship: Ship | undefined = gameboard.getShipById(data.shipId)
    if (ship) {
      gameboard.cleanBoardOnShip(ship)
      ship.cleanData()
      webScoketHelpers.sendGameboardData(ws, gameboard)
      await redisService.setGameboard(player.id, gameboard)
      return
    }
  }

  throw new Error('Error while removing a ship. Please try again.')
}

/**
 * Handle remove all ships from board and update the player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 */
export async function handleResetShips(ws: WebSocket, player: Player): Promise<void> {
  const gameboard: Gameboard = new Gameboard()
  webScoketHelpers.sendGameboardData(ws, gameboard)
  await redisService.setGameboard(player.id, gameboard)
}

/**
 * Handle attack single cell on the enemy gameboard and notify players.
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
  if (!gameSession) {
    throw new Error('Game is not created. Please create a new game.')
  }

  if (!opponent) {
    await redisService.setGameboard(player.id, new Gameboard())
    await redisService.setGameboard(player.id, new Gameboard(), 'attack')
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

  if (await processAttack(gameSession, player, opponent, data, ws, opponentWs)) {
    await handleEndOfGame(ws, player, gameSession, opponent, opponentWs)
  }
}

/**
 * Handle computer attack single cell attack on player gameboard and notify player.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameSession The current gameSession where player is connected.
 * @param attacker Current data about the attacker - computer.
 */
export async function handleAiAttack(
  ws: WebSocket,
  player: Player,
  gameSession: GameSession,
  attacker: PlayerComputer
) {
  const attackGameboard: Gameboard = await redisService.getGameboard(attacker.id, 'attack')
  const target = attacker.getAttackPosition(attackGameboard)
  if (await processAttack(gameSession, attacker, player, target, undefined, ws)) {
    await handleEndOfGame(ws, player, gameSession, attacker)
  }
  redisService.setPlayer(attacker)
}

/**
 * Process attack to the gameboard and notify the results.
 * @param gameSession The current game session where player is connected.
 * @param attacker Current data about player that is attacking.
 * @param opponent Current data about the opponent.
 * @param data The data indicating attack coordinates.
 * @param ws Current connection websocket.
 * @param opponentWs Current connection to opponent websocket.
 * @returns True if attack has been resulted to endgame, false otherwise.
 */
async function processAttack(
  gameSession: GameSession,
  attacker: Player | PlayerComputer,
  opponent: Player,
  data: any,
  ws?: WebSocket,
  opponentWs?: WebSocket
): Promise<boolean> {
  const opponentGameboard: Gameboard = await redisService.getGameboard(opponent.id)
  const attackGameboard: Gameboard = await redisService.getGameboard(attacker.id, 'attack')

  // Process attack.
  const attackedCell: GameboardCell = opponentGameboard.recieveAttack(data.row, data.col)
  attackGameboard.saveAttackResult(data.row, data.col, attackedCell)

  if (attacker instanceof PlayerComputer) {
    attacker.processAfterAttack(data.row, data.col, attackGameboard.size, attackedCell)
  }

  attackGameboard.lastAttack = data
  opponentGameboard.lastAttack = data

  // Notify players about the results.
  if (ws) {
    webScoketHelpers.sendGameboardData(ws, attackGameboard, 'attack')
  }

  if (opponentWs) {
    webScoketHelpers.sendGameboardData(opponentWs, opponentGameboard)
  }

  await redisService.setGameboard(attacker.id, attackGameboard, 'attack')
  await redisService.setGameboard(opponent.id, opponentGameboard)

  // Check if game can be ended.
  if (attackedCell.ship) {
    if (opponentGameboard.allShipsSunk()) {
      gameSession.winner = attacker.id
      return true
    }
  } else {
    gameSession.switchPlayer()
  }

  // Notify users about turns.
  if (ws) {
    webScoketHelpers.sendAction(ws, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer === attacker.id
    })
  }

  if (opponentWs) {
    webScoketHelpers.sendAction(opponentWs, 'game-turn', {
      isPlayerTurn: gameSession.currentPlayer !== attacker.id
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
 * @param opponentWs Current connection to opponent websocket.
 * @param sendGameEnded True if update needs to be send to a player, false otherwise.
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

  await redisService.setGameboard(player.id, new Gameboard())
  await redisService.setGameboard(player.id, new Gameboard(), 'attack')
  player.isReady = false

  if (opponent) {
    await redisService.setGameboard(opponent.id, new Gameboard())
    await redisService.setGameboard(opponent.id, new Gameboard(), 'attack')
    player.isReady = false
  }
  return true
}

/**
 * Save ended game data to the database.
 * @param gameSession The current gameSession where player is connected.
 * @param winner Current data about the winner player.
 * @param opponent Current data about the loser player.
 * @returns Data sent to the server.
 */
async function handleSaveGame(
  gameSession: GameSession,
  winner?: Player,
  opponent?: Player
): Promise<any> {
  const points =
    gameSession.type === GameSessionType.Online
      ? winner && winner.difficulty && opponent && opponent.difficulty
        ? 15 - 2 * (winner.difficulty - opponent.difficulty)
        : 15
      : 0

  // Prepare data to sent to server (save in the db).
  let gameData = {
    winnerId: gameSession.winner,
    gameType: gameSession.type,
    player1: {
      userId: winner ? winner.id : '',
      difficulty: winner ? winner.difficulty : '',
      gameboard: winner ? await redisService.getGameboard(winner.id) : '',
      attackGameboard: winner ? await redisService.getGameboard(winner.id, 'attack') : '',
      points: winner ? Math.ceil(points * 1.2) : ''
    },
    player2: {
      userId: opponent ? opponent.id : '',
      difficulty: opponent ? opponent.difficulty : '',
      gameboard: opponent ? await redisService.getGameboard(opponent.id) : '',
      attackGameboard: opponent ? await redisService.getGameboard(opponent.id, 'attack') : '',
      points: opponent ? -1 * points : ''
    }
  }

  // Send data to save in the db.
  await gameService.saveGame(gameData)

  return gameData
}
