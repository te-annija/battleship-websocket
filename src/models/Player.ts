/**
 * FILENAME: Player.ts
 * AUTHOR: Annija Karitone
 */

/**
 * Manage game session player data.
 */
export default class Player {
  /** The unique identifier for the player. */
  playerId: string

  /** The public name of the player. */
  username: string

  /** The difficulty of the player rank. */
  difficulty?: number

  /** The id of the gameroom where player is currently playing. */
  gameSessionId?: string

  /** Indicates if player is ready to start the game in a session. */
  isReady: boolean

  constructor(
    playerId: string,
    username: string,
    isReady: boolean = false,
    gameSessionId?: string,
    difficulty?: number
  ) {
    this.playerId = playerId
    this.username = username
    this.isReady = isReady
    this.difficulty = difficulty
    this.gameSessionId = gameSessionId
  }
}
