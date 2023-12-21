/**
 * FILENAME: Player.ts
 * AUTHOR: Annija Karitone
 */

import Gameboard from './Gameboard.js'
import GameboardCell from './GameboardCell.js'
import Ship from './Ship.js'

/**
 * Manage game session player data.
 */
export default class Player {
  /** The unique identifier for the player. */
  id: string

  /** The public name of the player. */
  username: string

  /** The player's own gameboard. */
  gameboard: Gameboard

  /** The results of the player's attacks on the enemy's gameboard. */
  attackGameboard: Gameboard

  /** The time of player last active action to Webserver. */
  lastActiveTime: number

  difficulty?: number

  /** The id of the gameroom where player is currently playing. */
  gameSessionId?: string

  constructor(
    id: string,
    username: string,
    gameboard?: Gameboard,
    attackGameboard?: Gameboard,
    gameSessionId?: string,
    difficulty?: number,
    lastActiveTime: number = new Date().getTime()
  ) {
    this.id = id
    this.username = username
    this.gameboard = gameboard
      ? new Gameboard(gameboard.size, gameboard.grid, gameboard.ships)
      : new Gameboard()
    this.attackGameboard = attackGameboard
      ? new Gameboard(attackGameboard.size, attackGameboard.grid, attackGameboard.ships)
      : new Gameboard()
    this.lastActiveTime = lastActiveTime
    this.difficulty = difficulty
    this.gameSessionId = gameSessionId
  }

  /**
   * Initiates an attack on the player's game board at the specified row and column.
   * @param row The target row index of the attack.
   * @param col The target column index of the attack.
   */
  recieveAttack(row: number, col: number): GameboardCell {
    return this.gameboard.attack(row, col)
  }

  /**
   * Saves attack result to attack gameboard.
   * @param row The target row index of the attack.
   * @param col The target column index of the attack.
   * @param enemyCell The result of the attack from the opponent gameboard.
   */
  saveAttackResult(row: number, col: number, enemyCell: GameboardCell): void {
    const attackCell = this.attackGameboard.grid[row][col]

    attackCell.state = enemyCell.state

    if (enemyCell.ship) {
      this.attackGameboard.setBorderingCellsAsMissed(row, col)

      if (enemyCell.ship.isSunk()) {
        this.attackGameboard.setAdjacentCellsAsMissed(enemyCell.ship)
        const ship: Ship | undefined = this.attackGameboard.getShipById(enemyCell.ship.id)
        if (ship) {
          ship.position = enemyCell.ship.position
          ship.hits = enemyCell.ship.hits

          this.attackGameboard.grid[ship.position.row][ship.position.col].ship = ship
        }
      }
    }
  }
}
