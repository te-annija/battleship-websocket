/**
 * FILENAME: GameboardCell.ts
 * AUTHOR: Annija Karitone
 */

import { GameboardCellState } from 'enums/GameboardCellState.js'
import Ship from './Ship.js'

/**
 * Represents an individual cell on the gameboard.
 */
export default class GameboardCell {
  gameboardCellId: number

  /** The state of the cell (e.g., empty, hit, missed). */
  state: GameboardCellState

  /** Reference to an occupying ship, or null if the cell is empty. */
  ship?: Ship

  /** The number of adjacent ships to the cell. */
  adjacentCount: number

  /** The datetime of the attack on the cell. */
  updatedAt: number

  constructor(
    gameboardCellId: number,
    state: GameboardCellState = GameboardCellState.Empty,
    adjacentCount: number = 0,
    ship?: Ship,
    updatedAt?: number
  ) {
    this.gameboardCellId = gameboardCellId
    this.state = state
    this.adjacentCount = adjacentCount
    this.ship = ship
    this.updatedAt = updatedAt ? updatedAt : new Date().getTime()
  }
}
