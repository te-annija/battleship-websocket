/**
 * FILENAME: GameRoom.ts
 * AUTHOR: Annija Karitone
 */

import Player from './Player.js'

/**
 * Manage mulitplayer game session keeping track of player information.
 */
export default class GameRoom {
  /** The first player of the game. */
  player1: Player

  /** The second player of the game. */
  player2: Player

  /** The player currently taking their move or null if the game is not stated. */
  currentPlayer?: Player

  /** The player who has won the game, or null if the game is ongoing. */
  winner?: Player

  /**
   * @param player1 The first player of the game
   * @param player2 The secon d player of the game
   */
  constructor(player1: Player, player2: Player) {
    this.player1 = player1
    this.player2 = player2
  }
}
