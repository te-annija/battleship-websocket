/**
 * Define possible states for a gameboard cell.
 */
export const enum BoardCellState {
  /** The cell is unoccupied */
  Empty = 'empty',

  /** The cell contains a ship */
  Ship = 'ship',

  /** The cell is attacked and the ship is hit */
  Hit = 'hit',

  /** The cell is attacked but missed */
  Miss = 'miss',

  /** The cell is attacked and the ship is sunk */
  Sunk = 'sunk'
}
