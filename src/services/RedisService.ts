/**
 * FILENAME: RedisService.ts
 * AUTHOR: Annija Karitone
 */
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
   * Request to save player data.
   * @param player The player data to save.
   * @returns The response if saving was successful.
   */
  async setPlayerData(player: Player): Promise<any> {
    const respone = this.setData(`player:${player.id}`, JSON.stringify(player))
    this.client.expire(`player:${player.id}`, 12000)
    return respone
  }

  /**
   * Request to get player data.
   * @param playerId The identification of a player to retrieve.
   * @returns The player object with data and methods.
   */
  async getPlayerData(playerId: string): Promise<Player | undefined> {
    try {
      const playerData: string = await this.getData(`player:${playerId}`)
      if (playerData) {
        const playerDataParsed = JSON.parse(playerData)
        return new Player(
          playerDataParsed.id,
          playerDataParsed.name,
          playerDataParsed.gameboard,
          playerDataParsed.attackGameboard,
          playerDataParsed.gameSessionId,
          playerDataParsed.lastActiveTime
        )
      }
      return undefined
    } catch (error) {
      console.error('Error getting player data:', error)
      return undefined
    }
  }

  /**
   * Request to save game session data.
   * @param gameSession The game session data to save.
   * @returns The response if saving was successful.
   */
  async setGameSessionData(gameSession: GameSession): Promise<any> {
    const gameSessionStringifiable = {
      ...gameSession,
      ready: Array.from(gameSession.ready.entries())
    }
    const response = await this.setData(
      `gameSession:${gameSession.id}`,
      JSON.stringify(gameSessionStringifiable)
    )

    this.client.expire(`gameSession:${gameSession.id}`, 12000)
    return response
  }

  /**
   * Request to get game session data.
   * @param gameSessionId The identification of a game session to retrieve.
   * @returns The game session object with data and methods.
   */
  async getGameSessionObject(gameSessionId: string): Promise<GameSession | undefined> {
    try {
      const gameSession: string = await this.getData(`gameSession:${gameSessionId}`)
      if (gameSession) {
        const gameSessionParsed: GameSession = JSON.parse(gameSession)
        return new GameSession(
          gameSessionParsed.id,
          gameSessionParsed.type,
          gameSessionParsed.player1,
          gameSessionParsed.player2,
          gameSessionParsed.currentPlayer,
          gameSessionParsed.playerAI,
          gameSessionParsed.winner,
          new Map(gameSessionParsed.ready),
          gameSessionParsed.isGameStarted
        )
      }
      return undefined
    } catch (error) {
      console.error('Error getting player data:', error)
      return undefined
    }
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
