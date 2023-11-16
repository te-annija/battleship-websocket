/**
 * FILENAME: GameRoom.ts
 * AUTHOR: Annija Karitone
 */

import Player from './Player.js'
import PlayerAI from './PlayerAI.js'
import { BoardCellState } from 'enums/BoardCellState.js'

/**
 * Manage mulitplayer game session keeping track of player information.
 */
export default class GameRoom {
  /** The gameroom unique identifier. */
  id: string

  /** The first player of the game. */
  player1?: Player

  /** The second player of the game. */
  player2?: Player

  /** The AI opponent if game mode is set to computer. */
  playerAI?: PlayerAI

  /** The player currently taking their move or null if the game is not stated. */
  currentPlayer?: Player

  /** The player who has won the game, or null if the game is ongoing. */
  winner?: Player

  /** The players who are ready to start the game. */
  ready: Map<string, boolean>

  /** True if either AI game or valid two player game is started and gameboards can no longer be edited. */
  isGameStarted: boolean

  /** The type of the game (eg., friend, random, computer). */
  type: string

  /**
   * @param id The unique identifier of the gameroom.
   * @param player1 The first player of the game.
   * @param type The type of the game.
   */
  constructor(id: string, player1: Player, type: string = 'random') {
    this.id = id
    this.player1 = player1
    this.currentPlayer = player1

    this.ready = new Map()
    this.isGameStarted = false
    this.type = type
  }

  /**
   * Initiates an attack on the game board at the specified row and column from the current user.
   *
   * @param row The row index of the attack.
   * @param col The column index of the attack.
   * @returns Returns true if the attack is valid and executed, false otherwise.
   */
  makeAttack(row: number, col: number): boolean {
    // The validation of the data.
    if (this.winner) {
      throw new Error('Cannot make an attack. The game has already ended.')
    }

    if (row === null || col === null) {
      throw new Error('Cannot make an attack. Row and column numbers are required.')
    }

    if (!this.currentPlayer || !this.player1 || (!this.playerAI && !this.player2)) {
      throw new Error('An unexpected error occurred. Please restart the game.')
    }

    if (
      !this.currentPlayer.gameboard.isCellWithinBoard(row, col) ||
      !(this.currentPlayer.enemyGameboard.grid[row][col].state === BoardCellState.Empty)
    ) {
      return false
    }

    // The handling of the attack.
    const currentPlayer = this.currentPlayer
    const enemy =
      this.currentPlayer === this.player1
        ? this.player2
          ? this.player2
          : this.playerAI
        : this.player1

    if (!enemy) {
      throw new Error('An unexpected error occurred. Please restart the game.')
    }

    enemy.recieveAttack(row, col)

    // Synchronize attack on both boards and handle turns.
    const cellPlayer = currentPlayer.enemyGameboard.grid[row][col]
    const cellEnemy = enemy.gameboard.grid[row][col]

    cellPlayer.state = cellEnemy.state

    if (cellEnemy.ship) {
      currentPlayer.enemyGameboard.setBorderingCellsAsMissed(row, col)

      if (currentPlayer === this.playerAI) {
        this.playerAI.addTargetedPositions({ row: row, col: col })
        if (cellEnemy.ship.isSunk()) {
          this.playerAI.resetTargets()
        }
      }

      if (cellEnemy.ship.isSunk()) {
        currentPlayer.enemyGameboard.setAdjacentCellsAsMissed(cellEnemy.ship)
        currentPlayer.enemyGameboard.grid[cellEnemy.ship.position.row][
          cellEnemy.ship.position.col
        ].ship = cellEnemy.ship
      }

      if (enemy.gameboard.allShipsSunk()) {
        this.winner = currentPlayer
      }
    } else {
      this.switchPlayer()
    }

    return true
  }

  /**
   * Switch the active player. The active player will be allowed to make an attack.
   */
  switchPlayer(): void {
    this.currentPlayer =
      this.currentPlayer === this.player1
        ? this.player2
          ? this.player2
          : this.playerAI
        : this.player1
  }

  /**
   * Initiates an AI-controlled player's attack on the game board.
   */
  makeAIAttack() {
    if (this.currentPlayer && this.playerAI) {
      let isValidAttack = false

      // Continue selecting attack positions until a valid attack is made.
      while (!isValidAttack) {
        const target = this.playerAI.getAttackPosition()

        isValidAttack = this.makeAttack(target.row, target.col)
      }
    }
  }

  /**
   * Returns if both players are ready to start the game and game can start successfully.
   *
   * @returns True if both players are ready to start the game.
   */
  isReady(): boolean {
    return this.ready.size == 2 && Array.from(this.ready.values()).every((ready) => ready)
  }

  /**
   * Set ready to start the game status for friend game.
   *
   * @param id The unique identifier of the player.
   * @param status The rady status - true if is ready to start the game, false otherwise.
   */
  setPlayerReadyStatus(id: string, status: boolean) {
    this.ready.set(id, status)
  }
}
