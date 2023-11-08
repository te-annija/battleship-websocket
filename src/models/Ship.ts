/**
 * FILENAME: Ship.ts
 * AUTHOR: Annija Karitone
 */

import ShipPosition from './ShipPosition.js'

/**
 * Represents battleship status.
 */
export default class Ship {
  /** The unique identifier for the ship. */
  id: string

  /** The name of the ship. */
  name: string

  /** The size of the battleship in units. */
  size: number

  /** The count of successful enemy attacks on the ship. */
  hits: number

  /** The position of the ship on the gameboard. */
  position: ShipPosition

  /** True if ship is placed on the board in valid coordinates. */
  isOnBoard: boolean

  /**
   * @param id The battleship unique identifier
   * @param name The battleship name
   * @param size The battleship size in units (should be less than gameboard size)
   */
  constructor(id: string, name: string, size: number) {
    this.id = id
    this.name = name
    this.size = size
    this.hits = 0 // No attacks on the ship initially
    this.position = new ShipPosition()
    this.isOnBoard = false
  }

  /**
   * Reset the ship position to default one.
   */
  cleanData(): void {
    this.position.row = -1
    this.position.col = -1
    this.position.isVertical = false
    this.isOnBoard = false
    this.hits = 0
  }

  /**
   * Checks if the ship is sunk, indicating that all its parts have been hit.
   * @returns True if the ship is sunk, false otherwise.
   */
  isSunk(): boolean {
    return this.hits >= this.size
  }

  /**
   * Checks if the ship is on the game board, indicating it has been placed during setup.
   * @returns True if the ship is on the board, false otherwise.
   */
  isShipOnBoard(): boolean {
    return this.isOnBoard
  }

  /**
   * Registers a hit on the ship.
   */
  hit(): void {
    this.hits++
  }
}
