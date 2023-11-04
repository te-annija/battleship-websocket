/**
 * FILENAME: BoardCell.ts
 * AUTHOR: Annija Karitone
 */

import { BoardCellState } from 'enums/BoardCellState.js'
import Ship from './Ship.js'

/**
 * Represents an individual cell on the gameboard.
 */
export default class BoardCell {
  /** The state of the cell (e.g., empty, hit, missed). */
  state: BoardCellState

  /** Reference to an occupying ship, or null if the cell is empty. */
  ship?: Ship

  /** The number of adjacent ships to the cell. */
  adjacentCount: number

  constructor() {
    this.state = BoardCellState.Empty
    this.adjacentCount = 0 // No adjacent ships initally because board is empty.
  }
}
