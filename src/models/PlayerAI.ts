/**
 * FILENAME: Player.ts
 * AUTHOR: Annija Karitone
 */

import { GameboardCellState } from 'enums/GameboardCellState.js'
import Gameboard from './Gameboard.js'
import GameboardCell from './GameboardCell.js'
import Player from './Player.js'

/**
 * Represents an AI-controlled player in the game and is resposible for targeting logic.
 */
export default class PlayerAI extends Player {
  /** The row and column index pairs to target if a ship is hit and need to be tageted further. */
  targets: { row: number; col: number }[]

  constructor(
    id: string,
    gameboard?: Gameboard,
    attackGameboard?: Gameboard,
    targets: { row: number; col: number }[] = []
  ) {
    super(id, 'Friendly AI', gameboard, attackGameboard)
    if (!gameboard) {
      this.gameboard.placeShipsRandomly()
    }
    this.targets = targets
  }

  /**
   * Generates a random target position on the game board.
   * @returns  A random target position with row and column indices.
   */
  private getRandomTarget(): { row: number; col: number } {
    return {
      row: Math.floor(Math.random() * this.gameboard.size),
      col: Math.floor(Math.random() * this.gameboard.size)
    }
  }

  /**
   * Determines the attack position for the AI player.
   * If the AI has targeted positions from a previous hit, it returns the one of the targeted positions.
   * If not, it randomly selects a target position on the game board.
   * @returns A target position for the AI's attack.
   */
  getAttackPosition(): { row: number; col: number } {
    let isValidPosition = false
    while (!isValidPosition) {
      const target = this.targets.pop() ?? this.getRandomTarget()
      if (this.attackGameboard.grid[target.row][target.col].state === GameboardCellState.Empty) {
        isValidPosition = true
        return target
      }
    }

    return {
      row: -1,
      col: -1
    }
  }

  /**
   * Adds adjacent positions to the list of targeted positions.
   * @param target The target position to explore adjacent positions.
   */
  addTargetedPositions(target: { row: number; col: number }): void {
    if (target.row > 0) {
      this.targets.push({ row: target.row - 1, col: target.col })
    }

    if (target.row < this.gameboard.size - 1) {
      this.targets.push({ row: target.row + 1, col: target.col })
    }

    if (target.col > 0) {
      this.targets.push({ row: target.row, col: target.col - 1 })
    }

    if (target.col < this.gameboard.size - 1) {
      this.targets.push({ row: target.row, col: target.col + 1 })
    }
  }

  /**
   * Resets the list of targeted positions when a ship is sunk.
   */
  resetTargets(): void {
    this.targets = []
  }

  /**
   * Updates targeted cells after an attack.
   * @param row
   * @param col
   * @param enemyCell
   */
  processAfterAttack(row: number, col: number, enemyCell: GameboardCell): void {
    if (enemyCell.ship) {
      this.addTargetedPositions({ row: row, col: col })
      if (enemyCell.ship.isSunk()) {
        this.resetTargets()
      }
    }
  }
}
