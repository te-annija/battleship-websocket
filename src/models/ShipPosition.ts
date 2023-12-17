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

  constructor(
    row: number = -1, // Coordinate outside the grid - placement invalid.
    col: number = -1, // Coordinate outside the grid - placement invalid.
    isVertical: boolean = false
  ) {
    this.row = row
    this.col = col
    this.isVertical = isVertical
  }
}
