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

  /** The player's own gameboard. */
  gameboard: Gameboard

  /** The results of the player's attacks on the enemy's gameboard. */
  enemyGameboard: Gameboard

  /**
   * @param id The unique identifier for the player.
   */
  constructor(id: string) {
    this.id = id
    this.gameboard = new Gameboard()
    this.enemyGameboard = new Gameboard()
  }
}
