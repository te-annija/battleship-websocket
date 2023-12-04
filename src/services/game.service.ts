/**
 * FILENAME: game.service.ts
 * AUTHOR: Annija Karitone
 */

import axios, { type AxiosResponse } from 'axios'
import config from 'config'

const API_URL = `${config.get('api')}/game`

/**
 * Service to handle interaction with backend to save game data.
 */
export class GameService {
  /**
   * Sends a request to save a new game.
   * @param gameData The game data to be saved
   * @returns The data about the request.
   */
  async saveGame(gameData: any): Promise<boolean> {
    try {
      const response: AxiosResponse = await axios.post(API_URL, gameData)
      console.log('Game data sent to server:', response.data)
      return true
    } catch (error: any) {
      console.error('Error sending game data to server:', error.message)
      return false
    }
  }
}

export default new GameService()
