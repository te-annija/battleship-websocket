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

  constructor() {
    this.state = BoardCellState.Empty
  }
}
