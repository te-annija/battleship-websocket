/**
 * FILENAME: Gameboard.ts
 * AUTHOR: Annija Karitone
 */

import BoardCell from './BoardCell.js'
import Ship from './Ship.js'
import config from 'config'

/**
 * Manage gameboard and game logic.
 */
export default class Gameboard {
  /** The row and column count of the gameboard in units. */
  size: number

  /** The minimum coordinate value. */
  coord_min: number

  /** The maximum coordinate value (size - 1). */
  coord_max: number

  /** A 2D grid containing board cells with the same rows and columns as size. */
  grid: BoardCell[][]

  /** All ships on the board. */
  ships: Ship[]

  constructor() {
    this.size = config.get('boardSize')
    this.coord_min = 0
    this.coord_max = this.size - 1

    // Initializing the 2D grid with empty cells.
    this.grid = []
    for (let i = 0; i < this.size; i++) {
      this.grid.push(new Array())

      for (let j = 0; j < this.size; j++) {
        this.grid[i].push(new BoardCell())
      }
    }

    // Initializing the ships array based on ship configurations.
    this.ships = []
    const shipConfigs: any = config.get('battleships')
    for (const shipConfig of shipConfigs) {
      for (let i = 0; i < shipConfig.count; i++) {
        this.ships.push(new Ship(shipConfig.name + '-' + i, shipConfig.name, shipConfig.size))
      }
    }
  }
}
