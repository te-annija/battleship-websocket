/**
 * FILENAME: ShipPosition.ts
 * AUTHOR: Annija Karitone
 */

/**
 * Represents ship position on the grid.
 */
export default class ShipPosition {
  /** The row number where the ship is positioned. */
  row: number

  /** The column number where the ship is positioned. */
  col: number

  /** Indicates if the ship is oriented vertically or horizontally. */
  isVertical: boolean

  constructor() {
    this.row = -1 // Coordinate outside the grid - placement invalid.
    this.col = -1 // Coordinate outside the grid - placement invalid.
    this.isVertical = false
  }
}
