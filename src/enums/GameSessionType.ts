/**
 * Define possible types for a game session.
 */
export const enum GameSessionType {
  /** The game is played against invited friend. */
  Friend = 'friend',

  /** The game is played against randomly selected opponent. */
  Online = 'online',

  /** The game is played against computer. */
  Computer = 'computer'
}
