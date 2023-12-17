/**
 * FILENAME: GameSession.ts
 * AUTHOR: Annija Karitone
 */

import { GameSessionType } from 'enums/GameSessionType.js'
import PlayerAI from './PlayerAI.js'

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

  /** The AI opponent if game mode is set to computer. */
  playerAI?: PlayerAI

  /** The player currently taking their move or null if the game is not stated. */
  currentPlayer?: string

  /** The player who has won the game, or null if the game is ongoing. */
  winner?: string

  /** The players who are ready to start the game. */
  ready: Map<string, boolean>

  /** True if either AI game or valid two player game is started and gameboards can no longer be edited. */
  isGameStarted: boolean

  /** The type of the game (eg., friend, random, computer). */
  type: GameSessionType

  constructor(
    id: string,
    type: GameSessionType = GameSessionType.Random,
    player1?: string,
    player2?: string,
    currentPlayer?: string,
    playerAI?: PlayerAI,
    winner?: string,
    ready: Map<string, boolean> = new Map(),
    isGameStarted: boolean = false
  ) {
    this.id = id
    this.player1 = player1
    this.player2 = player2
    this.currentPlayer = currentPlayer
    this.type = type
    if (playerAI) {
      this.playerAI = new PlayerAI(
        playerAI.id,
        playerAI.gameboard,
        playerAI.attackGameboard,
        playerAI.targets
      )
    }
    this.winner = winner

    this.ready = ready
    this.isGameStarted = isGameStarted
  }

  /**
   * Switch the active player. The active player will be allowed to make an attack.
   */
  switchPlayer(): void {
    if (this.player2) {
      this.currentPlayer = this.currentPlayer === this.player1 ? this.player2 : this.player1
    } else if (this.playerAI) {
      this.currentPlayer = this.currentPlayer === this.player1 ? this.playerAI.id : this.player1
    }
  }

  /**
   * Returns if both players are ready to start the game and game can start successfully.
   *
   * @returns True if both players are ready to start the game.
   */
  isReady(): boolean {
    return this.ready.size == 2 && Array.from(this.ready.values()).every((ready) => ready)
  }

  /**
   * Set ready to start the game status for friend game.
   *
   * @param id The unique identifier of the player.
   * @param status The rady status - true if is ready to start the game, false otherwise.
   */
  setPlayerReadyStatus(id: string, status: boolean) {
    this.ready.set(id, status)
  }

  /**
   * Resets game session data to prepare for rematch.
   */
  resetGame() {
    this.ready = new Map()
    this.isGameStarted = false
    this.winner = undefined
    this.currentPlayer = undefined
  }
}
