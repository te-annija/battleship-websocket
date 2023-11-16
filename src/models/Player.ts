/**
 * FILENAME: Player.ts
 * AUTHOR: Annija Karitone
 */

import Gameboard from './Gameboard.js'

/**
 * Manage game session player data.
 */
export default class Player {
  /** The unique identifier for the player. */
  id: string

  /** The public name of the player. */
  name: string

  /** The player's own gameboard. */
  gameboard: Gameboard

  /** The results of the player's attacks on the enemy's gameboard. */
  enemyGameboard: Gameboard

  /** The time of player last active action to Webserver. */
  lastActiveTime: number

  /** The id of the gameroom where player is currently playing. */
  gameRoomId?: string

  /**
   * @param id The unique identifier for the player.
   * @param name The public name of the player.
   */
  constructor(id: string, name: string) {
    this.id = id
    this.name = name
    this.gameboard = new Gameboard()
    this.enemyGameboard = new Gameboard()
    this.lastActiveTime = new Date().getTime()
  }

  /**
   * Initiates an attack on the player's game board at the specified row and column.
   *
   * @param row The target row index of the attack.
   * @param col The target column index of the attack.
   */
  recieveAttack(row: number, col: number): void {
    this.gameboard.attack(row, col)
  }
}
