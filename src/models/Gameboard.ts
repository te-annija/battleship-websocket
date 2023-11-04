/**
 * FILENAME: Gameboard.ts
 * AUTHOR: Annija Karitone
 */

import BoardCell from './BoardCell.js'
import Ship from './Ship.js'
import ShipPosition from './ShipPosition.js'
import config from 'config'
import { BoardCellState } from 'enums/BoardCellState.js'

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

  /**
   * Places all ships on board in randomized positions.
   */
  placeShipsRandomly(): void {
    this.cleanBoard()

    for (let ship of this.ships) {
      let position = null
      do {
        position = this.getRandomStartPosition(ship)
      } while (!this.placeShip(ship, position))
    }
  }

  /**
   * Places ship on the grid starting on position if placement is valid.
   *
   * @param ship The ship that needs to be added to the grid.
   * @returns Returns true if ship is placed on board successfully.
   */
  placeShip(ship: Ship, position: ShipPosition): boolean {
    const shipClone = JSON.parse(JSON.stringify(ship))
    shipClone.position = position

    if (!this.isValidPlacement(shipClone)) {
      return false
    }

    if (ship.isOnBoard) {
      this.cleanBoardOnShip(ship)
    }

    ship.position = position
    ship.isOnBoard = true
    this.saveShipOnGrid(ship)
    return true
  }

  /**
   * Resets all ship positions and cell states on board.
   */
  cleanBoard(): void {
    for (let i = 0; i < this.grid.length; i++) {
      for (let j = 0; j < this.grid[i].length; j++) {
        this.grid[i][j].ship = undefined
        this.grid[i][j].state = BoardCellState.Empty
        this.grid[i][j].adjacentCount = 0
      }
    }

    for (let ship of this.ships) {
      ship.cleanData()
    }
  }

  /**
   * Cleans the board around all position of the ship. Needed to remove the ship from board.
   *
   * @param ship The ship that needs to be removed.
   */
  cleanBoardOnShip(ship: Ship): void {
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      let cell: BoardCell = this.grid[offsetRow][offsetCol]

      if (cell.adjacentCount <= 1) {
        cell.state = BoardCellState.Empty
        cell.ship = undefined
        cell.adjacentCount = 0
      } else {
        cell.adjacentCount -= 1
      }
    })
  }

  /**
   * Determine if the ship placement on the grid would be valid.
   *
   * @param ship The ship whose placement on the grid needs to be checked.
   * @returns Returns true if ship palcement is valid.
   */
  private isValidPlacement(ship: Ship): boolean {
    return this.isShipWithinBoard(ship) && !this.isShipOverlap(ship)
  }

  /**
   * Place validated ship on the board by marking occupied cells as 'ship'.
   * Placement will start at position detemined in position property.
   *
   * @param ship The ship that needs to be added to the grid.
   */
  private saveShipOnGrid(ship: Ship): void {
    for (let i = 0; i < ship.size; i++) {
      const col = ship.position.isVertical ? ship.position.col : ship.position.col + i
      const row = ship.position.isVertical ? ship.position.row + i : ship.position.row

      if (!this.isCellWithinBoard(row, col)) {
        continue
      }

      let cell: BoardCell = this.grid[row][col]
      cell.state = BoardCellState.Ship
      cell.ship = ship
    }
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      let cell: BoardCell = this.grid[offsetRow][offsetCol]
      if (cell.state !== BoardCellState.Ship) {
        cell.state = BoardCellState.Adjacent
        cell.adjacentCount += 1
      }
    })
  }

  /**
   * Returns the ship if ship with shipId exists, and undefined otherwise.
   * @param shipId  The id of the ship to be found.
   * @returns The ship if ID exists or undefiend otherwise.
   */
  getShipById(shipId: string): Ship | undefined {
    console.log(shipId)
    return this.ships.find((ship) => ship.id === shipId)
  }

  /**
   *  Get random start position on the grid taking into account ship size.
   *
   * @param ship The ship that needs to be added to the grid.
   * @returns The start position on the grid for the ship.
   */
  private getRandomStartPosition(ship: Ship): ShipPosition {
    let position: ShipPosition = new ShipPosition()
    position.isVertical = Math.random() < 0.5 ? true : false

    const maxRow = position.isVertical ? this.coord_max - ship.size + 1 : this.coord_max
    const maxCol = position.isVertical ? this.coord_max : this.coord_max - ship.size + 1

    position.row = Math.ceil(Math.random() * maxRow)
    position.col = Math.ceil(Math.random() * maxCol)

    return position
  }

  /**
   * Validates if ship would be within boarders of the grid.
   *
   * @param ship The ship whose placement on the board needs to be checked.
   * @returns Returns true if ship is within borders.
   */
  private isShipWithinBoard(ship: Ship): boolean {
    if (!this.isCellWithinBoard(ship.position.row, ship.position.col)) {
      return false
    }

    if (ship.position.isVertical) {
      return ship.position.row + ship.size - 1 <= this.coord_max
    } else {
      return ship.position.col + ship.size - 1 <= this.coord_max
    }
  }

  /**
   * Validates if cell with row and column index would be within the board.
   *
   * @param rowIndex The row index of the grid.
   * @param colIndex The column index of the grid.
   * @returns Returns true if cell is within boarders.
   */
  private isCellWithinBoard(rowIndex: number, colIndex: number): boolean {
    return (
      rowIndex <= this.coord_max &&
      rowIndex >= this.coord_min &&
      colIndex <= this.coord_max &&
      colIndex >= this.coord_min
    )
  }

  /**
   * Checks if ship overlaps or is adjacent to another placed ship.
   *
   * @param ship The ship whose surrounding ships need to be checked.
   * @returns Returns true if ship overlaps another ship.
   */
  private isShipOverlap(ship: Ship): boolean {
    let isOverlap: boolean = false
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      if (this.grid[offsetRow][offsetCol].ship) {
        isOverlap = true
      }
    })
    return isOverlap
  }

  /**
   * Helper method to iterate thorugh all adjacent cells of the ship including the ship.
   *
   * @param ship The ship whose adjacent cells need to be iterated.
   * @param callback The callback function that executes for all cells that adjacent to the ship.
   */
  private iterateAdjacentCells(ship: Ship, callback: (row: number, col: number) => void): void {
    for (let i = 0; i < ship.size; i++) {
      const targetRow = ship.position.isVertical ? ship.position.row + i : ship.position.row
      const targetCol = ship.position.isVertical ? ship.position.col : ship.position.col + i

      const offsets = [
        { row: 0, col: 0 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
        { row: -1, col: 0 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: -1 },
        { row: -1, col: 1 },
        { row: -1, col: -1 }
      ]

      for (const offset of offsets) {
        const offsetRow = targetRow + offset.row
        const offsetCol = targetCol + offset.col

        if (this.isCellWithinBoard(offsetRow, offsetCol)) {
          callback(offsetRow, offsetCol)
        }
      }
    }
  }
}
