/**
 * FILENAME: GameSession.ts
 * AUTHOR: Annija Karitone
 */

import { GameSessionType } from 'enums/GameSessionType.js'

/**
 * Manage mulitplayer game session keeping track of player information.
 */
export default class GameSession {
  /** The game session unique identifier. */
  id: string

  /** The first player of the game. */
  player1?: string

  /** The second player of the game. */
  player2?: string

  /** The player currently taking their move or null if the game is not stated. */
  currentPlayer?: string

  /** The player who has won the game, or null if the game is ongoing. */
  winner?: string

  /** True if either AI game or valid two player game is started and gameboards can no longer be edited. */
  isGameStarted: boolean

  /** The type of the game (eg., friend, online, computer). */
  type: GameSessionType

  constructor(
    id: string,
    type: GameSessionType = GameSessionType.Online,
    player1?: string,
    player2?: string,
    currentPlayer?: string,
    winner?: string,
    isGameStarted: boolean = false
  ) {
    this.id = id
    this.type = type
    this.player1 = player1
    this.player2 = player2
    this.currentPlayer = currentPlayer
    this.type = type
    this.winner = winner
    this.isGameStarted = isGameStarted
  }

  /**
   * Switch the active player. The active player will be allowed to make an attack.
   */
  switchPlayer(): void {
    this.currentPlayer = this.currentPlayer === this.player1 ? this.player2 : this.player1
  }

  /**
   * Resets game session data to prepare for rematch.
   */
  resetGame() {
    this.isGameStarted = false
    this.winner = undefined
    this.currentPlayer = undefined
  }
}
