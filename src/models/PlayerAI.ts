/**
 * FILENAME: Player.ts
 * AUTHOR: Annija Karitone
 */

import Player from './Player.js'

/**
 * Represents an AI-controlled player in the game and is resposible for targeting logic.
 */
export default class PlayerAI extends Player {
  /** The row and column index pairs to target if a ship is hit and need to be tageted further. */
  private targets: { row: number; col: number }[]

  constructor(id: string) {
    super(id, 'Friendly AI')
    this.gameboard.placeShipsRandomly()
    this.targets = []
  }

  /**
   * Generates a random target position on the game board.
   *
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
   *
   * If the AI has targeted positions from a previous hit, it returns the one of the targeted positions.
   * If not, it randomly selects a target position on the game board.
   *
   * @returns A target position for the AI's attack.
   */
  getAttackPosition(): { row: number; col: number } {
    // Check if the last hit was successful and the ship is not yet sunk
    if (this.targets.length > 0) {
      return this.targets.pop() ?? this.getRandomTarget()
    } else {
      // Otherwise, hunt for a ship randomly
      return this.getRandomTarget()
    }
  }

  /**
   * Adds adjacent positions to the list of targeted positions.
   *
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
}
