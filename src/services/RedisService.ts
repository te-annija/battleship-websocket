/**
 * FILENAME: RedisService.ts
 * AUTHOR: Annija Karitone
 */
import PlayerComputer from '../models/PlayerComputer.js'
import Gameboard from '../models/Gameboard.js'
import GameSession from '../models/GameSession.js'
import Player from '../models/Player.js'
import Redis from 'ioredis'

class RedisService {
  private client: Redis

  constructor() {
    this.client = new Redis()
    this.client.on('error', (err: any) => console.log('Redis Client Error', err))
  }

  /**
   * Request to save gameboard data for a player.
   * @param playerId The identification of a player to save gameboard data.
   * @param gameboard The gameboard data to save.
   * @param type The type of the gameboard (player or attack)
   * @returns The response if saving was successful.
   */
  async setGameboard(
    playerId: string,
    gameboard: Gameboard,
    type: string = 'player'
  ): Promise<any> {
    const response = await this.setData(`Gameboard:${playerId}${type}`, JSON.stringify(gameboard))
    this.client.expire(`Gameboard:${playerId}player`, 12000)
    this.client.expire(`Gameboard:${playerId}attack`, 12000)
    this.client.expire(`Player:${playerId}`, 12000)
    return response
  }

  /**
   * Request to get gameboard data for a player.
   * @param playerId The identification of a player to retrieve gameboard data.
   * @param type The type of the gameboard (player or attack)
   * @returns The gameboard data associated with the player.
   */
  async getGameboard(playerId: string, type: string = 'player'): Promise<Gameboard> {
    try {
      const gameboardData = await this.getData(`Gameboard:${playerId}${type}`)
      if (gameboardData) {
        const { size, grid, ships } = JSON.parse(gameboardData)
        return new Gameboard(size, grid, ships)
      }
      throw new Error('Something went wrong, please reload the page!')
    } catch (error) {
      throw new Error('Something went wrong, please reload the page!')
    }
  }

  /**
   * Request to save player data.
   * @param player The player data to save.
   * @returns The response if saving was successful.
   */
  async setPlayer(player: Player | PlayerComputer): Promise<any> {
    const respone = this.setData(`Player:${player.id}`, JSON.stringify(player))
    this.client.expire(`Player:${player.id}`, 12000)
    return respone
  }

  /**
   * Request to get player data.
   * @param playerId The identification of a player to retrieve.
   * @returns The player object with data and methods.
   */
  async getPlayer(playerId: string): Promise<Player | undefined> {
    try {
      const playerData: string = await this.getData(`Player:${playerId}`)
      if (playerData) {
        return JSON.parse(playerData)
      }
      return undefined
    } catch (error) {
      console.error('Error getting player data:', error)
      return undefined
    }
  }

  /**
   * Request to get computer player data.
   * @param playerId The identification of a computer player to retrieve.
   * @returns The computer player object with data and methods.
   */
  async getPlayerComputer(playerId: string): Promise<PlayerComputer | undefined> {
    try {
      const playerData: string = await this.getData(`Player:${playerId}`)
      if (playerData) {
        const { id, targets } = JSON.parse(playerData)
        return new PlayerComputer(id, targets)
      }
      return undefined
    } catch (error) {
      console.error('Error getting player data:', error)
      return undefined
    }
  }

  /**
   * Request to delete player data and gameboards.
   * @param playerId The identification of a player
   */
  async deletePlayer(playerId: string) {
    this.client.del(`Player:${playerId}`)
    this.client.del(`Gameboard:${playerId}player`)
    this.client.del(`Gameboard:${playerId}attack`)
  }

  /**
   * Request to save game session data.
   * @param gameSession The game session data to save.
   * @returns The response if saving was successful.
   */
  async setGameSession(gameSession: GameSession): Promise<any> {
    const response = await this.setData(
      `GameSession:${gameSession.id}`,
      JSON.stringify(gameSession)
    )

    this.client.expire(`GameSession:${gameSession.id}`, 12000)
    return response
  }

  /**
   * Request to get game session data.
   * @param gameSessionId The identification of a game session to retrieve.
   * @returns The game session object with data and methods.
   */
  async getGameSession(gameSessionId: string): Promise<GameSession | undefined> {
    try {
      const gameSession: string = await this.getData(`GameSession:${gameSessionId}`)
      if (gameSession) {
        const gameSessionParsed: GameSession = JSON.parse(gameSession)
        return new GameSession(
          gameSessionParsed.id,
          gameSessionParsed.type,
          gameSessionParsed.player1,
          gameSessionParsed.player2,
          gameSessionParsed.currentPlayer,
          gameSessionParsed.winner,
          gameSessionParsed.isGameStarted
        )
      }
      return undefined
    } catch (error) {
      console.error('Error getting game session data:', error)
      return undefined
    }
  }

  /**
   * Request to delete game session data.
   * @param gameSessionId The identification of a game session
   */
  async deleteGameSession(gameSessionId: string) {
    this.client.del(`GameSession:${gameSessionId}`)
  }

  /**
   * Request to save data to Redis.
   * @param key The key for the data.
   * @param value The value of the data.
   * @returns Response if saving was successful.
   */
  private async setData(key: string, value: string): Promise<any> {
    return this.client.set(key, value)
  }

  /**
   * Request to get data from Redis.
   * @param key The key of the data.
   * @returns The value associated with the key.
   */
  private async getData(key: string): Promise<any> {
    return this.client.get(key)
  }

  /**
   * Request to get if key exists in Redis.
   * @param key The key of the data.
   * @returns The boolean if key exists.
   */
  async existsData(key: string): Promise<any> {
    return this.client.exists(key)
  }

  /**
   * Closes connection to Redis.
   */
  closeConnection(): void {
    this.client.quit()
  }
}

export default new RedisService()
