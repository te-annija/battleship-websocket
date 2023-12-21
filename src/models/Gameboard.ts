/**
 * FILENAME: Gameboard.ts
 * AUTHOR: Annija Karitone
 */

import GameboardCell from './GameboardCell.js'
import Ship from './Ship.js'
import ShipPosition from './ShipPosition.js'
import config from 'config'
import { GameboardCellState } from 'enums/GameboardCellState.js'

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
  grid: GameboardCell[][]

  /** All ships on the board. */
  ships: Ship[]

  constructor(size: number = config.get('boardSize'), grid?: GameboardCell[][], ships?: Ship[]) {
    this.size = size
    this.coord_min = 0
    this.coord_max = size - 1

    // Initializing the ships array based on ship configurations.
    this.ships = []
    if (ships) {
      for (const ship of ships) {
        this.ships.push(
          new Ship(
            ship.id,
            ship.name,
            ship.size,
            ship.hits,
            new ShipPosition(ship.position.row, ship.position.col, ship.position.isVertical),
            ship.isOnBoard
          )
        )
      }
    } else {
      const shipConfigs: any = config.get('battleships')
      for (const shipConfig of shipConfigs) {
        for (let i = 0; i < shipConfig.count; i++) {
          this.ships.push(new Ship(shipConfig.name + '-' + i, shipConfig.name, shipConfig.size))
        }
      }
    }

    // Initializing the 2D grid with empty cells.
    this.grid = []
    for (let i = 0; i < this.size; i++) {
      this.grid.push(new Array())

      for (let j = 0; j < this.size; j++) {
        if (grid && grid[i][j]) {
          const shipData: Ship | undefined = grid[i][j].ship
          const ship: Ship | undefined = shipData ? this.getShipById(shipData.id) : undefined

          this.grid[i].push(new GameboardCell(grid[i][j].state, grid[i][j].adjacentCount, ship))
        } else {
          this.grid[i].push(new GameboardCell())
        }
      }
    }
  }

  /**
   * Places ship on the grid starting on position if placement is valid.
   * @param ship The ship that needs to be added to the grid.
   * @returns Returns true if ship is placed on board successfully.
   */
  placeShip(ship: Ship, position: ShipPosition): boolean {
    const shipClone = JSON.parse(JSON.stringify(ship))
    shipClone.position = position
    if (ship.isOnBoard) {
      this.cleanBoardOnShip(ship)
    }
    if (!this.isValidPlacement(shipClone)) {
      if (ship.isOnBoard) {
        this.saveShipOnGrid(ship)
      }
      return false
    }

    ship.position = position
    ship.isOnBoard = true
    this.saveShipOnGrid(ship)
    return true
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
   * Cleans the board around all position of the ship. Needed to remove the ship from board.
   * @param ship The ship that needs to be removed.
   */
  cleanBoardOnShip(ship: Ship): void {
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      let cell: GameboardCell = this.grid[offsetRow][offsetCol]

      if (cell.adjacentCount <= 1) {
        cell.state = GameboardCellState.Empty
        cell.ship = undefined
        cell.adjacentCount = 0
      } else {
        cell.adjacentCount -= 1
      }
    })
  }

  /**
   * Resets all ship positions and cell states on board.
   */
  cleanBoard(): void {
    for (let i = 0; i < this.grid.length; i++) {
      for (let j = 0; j < this.grid[i].length; j++) {
        this.grid[i][j].ship = undefined
        this.grid[i][j].state = GameboardCellState.Empty
        this.grid[i][j].adjacentCount = 0
      }
    }

    for (let ship of this.ships) {
      ship.cleanData()
    }
  }

  /**
   * Checks if all the ships on the game board are sunk.
   * @returns Returns true if all ships are sunk; otherwise, returns false.
   */
  allShipsSunk(): boolean {
    return this.ships.every((ship) => ship.isSunk())
  }

  /**
   * Checks if all the ships are placed on the game board.
   * @returns Returns true if all ships are successfully placed on the board; otherwise, returns false.
   */
  isAllShipsOnBoard(): boolean {
    return this.ships.every((ship) => ship.isShipOnBoard())
  }

  /**
   * Handle the opponent attack on the grid cell. Changes the cell state and modifies the hit ship.
   * @param row The row index of the target cell.
   * @param col The column index of the target cell.
   */
  attack(row: number, col: number): GameboardCell {
    if (!this.isCellWithinBoard(row, col)) {
      throw new Error('Invalid guess coordinates.')
    }

    const cell = this.grid[row][col]
    const cellState = cell.state

    if (cellState === GameboardCellState.Empty || cellState === GameboardCellState.Adjacent) {
      cell.state = GameboardCellState.Miss
    } else if (cellState === GameboardCellState.Ship && cell.ship) {
      cell.state = GameboardCellState.Hit
      cell.ship.hit()
      this.setBorderingCellsAsMissed(row, col)

      if (cell.ship.isSunk()) {
        this.setAdjacentCellsAsMissed(cell.ship)
      }
    }

    return cell
  }

  /**
   * Marks cells diagonally of the surrounding a specified location as "missed" to indicate that they cannot contain a ship.
   * @param row The row index of the target location.
   * @param col The column index of the target location.
   */
  setBorderingCellsAsMissed(row: number, col: number): void {
    const offsets = [
      { row: 1, col: 1 },
      { row: 1, col: -1 },
      { row: -1, col: 1 },
      { row: -1, col: -1 }
    ]
    for (const offset of offsets) {
      const offsetRow = row + offset.row
      const offsetCol = col + offset.col

      if (this.isCellWithinBoard(offsetRow, offsetCol)) {
        this.setCellAsMissed(offsetRow, offsetCol)
      }
    }
  }

  /**
   * Marks all adjacent cells of a ship as missed, indicating that they do not contain a ship.
   * @param ship The ship for which adjacent cells should be marked as missed.
   */
  setAdjacentCellsAsMissed(ship: Ship): void {
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      this.setCellAsMissed(offsetRow, offsetCol)
    })
  }

  /**
   * Validates if cell with row and column index would be within the board.
   * @param rowIndex The row index of the grid.
   * @param colIndex The column index of the grid.
   * @returns Returns true if cell is within boarders.
   */
  isCellWithinBoard(rowIndex: number, colIndex: number): boolean {
    return (
      rowIndex <= this.coord_max &&
      rowIndex >= this.coord_min &&
      colIndex <= this.coord_max &&
      colIndex >= this.coord_min
    )
  }

  /**
   * Returns the ship if ship with shipId exists, and undefined otherwise.
   * @param shipId  The id of the ship to be found.
   * @returns The ship if ID exists or undefiend otherwise.
   */
  getShipById(shipId: string): Ship | undefined {
    return this.ships.find((ship) => ship.id === shipId)
  }

  /**
   * Determine if the ship placement on the grid would be valid.
   * @param ship The ship whose placement on the grid needs to be checked.
   * @returns Returns true if ship palcement is valid.
   */
  private isValidPlacement(ship: Ship): boolean {
    const { row, col, isVertical } = ship.position

    // Check if start position is within the gameboard boundaries.
    if (!this.isCellWithinBoard(row, col)) {
      return false
    }

    // Check if end position is within the board boundaries based on ship orientation.
    const endRow = isVertical ? row + ship.size - 1 : row
    const endCol = isVertical ? col : col + ship.size - 1

    if (!this.isCellWithinBoard(endRow, endCol)) {
      return false
    }

    // Check for overlaps with other ships.
    let hasOverlap = false

    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      if (this.grid[offsetRow][offsetCol].ship) {
        hasOverlap = true
        return
      }
    })

    return !hasOverlap
  }

  /**
   * Place validated ship on the board by marking occupied cells as 'ship'.
   * Placement will start at position detemined in position property.
   * @param ship The ship that needs to be added to the grid.
   */
  private saveShipOnGrid(ship: Ship): void {
    for (let i = 0; i < ship.size; i++) {
      const col = ship.position.isVertical ? ship.position.col : ship.position.col + i
      const row = ship.position.isVertical ? ship.position.row + i : ship.position.row

      if (!this.isCellWithinBoard(row, col)) {
        continue
      }

      let cell: GameboardCell = this.grid[row][col]
      cell.state = GameboardCellState.Ship
      cell.ship = ship
    }
    this.iterateAdjacentCells(ship, (offsetRow, offsetCol) => {
      let cell: GameboardCell = this.grid[offsetRow][offsetCol]
      if (cell.state !== GameboardCellState.Ship) {
        cell.state = GameboardCellState.Adjacent
        cell.adjacentCount += 1
      }
    })
  }

  /**
   * Get random start position on the grid taking into account ship size.
   * @param ship The ship that needs to be added to the grid.
   * @returns The start position on the grid for the ship.
   */
  private getRandomStartPosition(ship: Ship): ShipPosition {
    let position: ShipPosition = new ShipPosition()
    position.isVertical = Math.random() < 0.5 ? true : false

    const maxRow = position.isVertical ? this.coord_max - ship.size + 1 : this.coord_max
    const maxCol = position.isVertical ? this.coord_max : this.coord_max - ship.size + 1

    position.row = Math.floor(Math.random() * (maxRow + 1))
    position.col = Math.floor(Math.random() * (maxCol + 1))

    return position
  }

  /**
   * Helper method to iterate thorugh all adjacent cells of the ship including the ship.
   * @param ship The ship whose adjacent cells need to be iterated.
   * @param callback The callback function that executes for all cells that adjacent to the ship.
   */
  private iterateAdjacentCells(ship: Ship, callback: (row: number, col: number) => void): void {
    const fromRow: number = ship.position.row - 1
    const toRow: number = ship.position.isVertical
      ? ship.position.row + ship.size
      : ship.position.row + 1

    const fromCol: number = ship.position.col - 1
    const toCol: number = ship.position.isVertical
      ? ship.position.col + 1
      : ship.position.col + ship.size

    for (let targetRow = fromRow; targetRow <= toRow; targetRow++) {
      for (let targetCol = fromCol; targetCol <= toCol; targetCol++) {
        if (this.isCellWithinBoard(targetRow, targetCol)) {
          callback(targetRow, targetCol)
        }
      }
    }
  }

  /**
   * Marks a specific cell as missed if it is within the game board boundaries and is either empty or adjacent.
   * @param row The row index of the cell to mark as missed.
   * @param col The column index of the cell to mark as missed.
   */
  private setCellAsMissed(row: number, col: number): void {
    if (this.isCellWithinBoard(row, col)) {
      const cell = this.grid[row][col]
      if (cell.state === GameboardCellState.Empty || cell.state === GameboardCellState.Adjacent) {
        cell.state = GameboardCellState.Miss
      }
    }
  }
}
