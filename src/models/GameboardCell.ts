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
  /** The state of the cell (e.g., empty, hit, missed). */
  state: GameboardCellState

  /** Reference to an occupying ship, or null if the cell is empty. */
  ship?: Ship

  /** The number of adjacent ships to the cell. */
  adjacentCount: number

  constructor(
    state: GameboardCellState = GameboardCellState.Empty,
    adjacentCount: number = 0,
    ship?: Ship | undefined
  ) {
    this.state = state
    this.adjacentCount = adjacentCount
    this.ship = ship
  }
}
