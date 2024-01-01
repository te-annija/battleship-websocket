/**
 * FILENAME: BackendService.ts
 * AUTHOR: Annija Karitone
 */

import axios from 'axios'
import jwt from 'jsonwebtoken'
import 'dotenv/config'

const API_URL: any = process.env.API
const JWT_SECRET: any = process.env.JWT_SECRET
const JWT_SECRET_WS: any = process.env.JWT_SECRET_WS
/**
 * Service to handle interaction with backend to save game data.
 */
export class BackendService {
  /**
   * Sends a request to get user data.
   * @param token The token of an authorized user.
   * @returns The data about the request.
   */
  async getUserData(token: string): Promise<any> {
    try {
      return new Promise((resolve) => {
        jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
          if (err || !decoded) {
            resolve(null)
          } else {
            try {
              const response = await axios.get(`${API_URL}/user/${decoded.user.id}`)
              resolve(response.data.user)
            } catch (error) {
              resolve(null)
            }
          }
        })
      })
    } catch (error) {
      return null
    }
  }

  /**
   * Sends a request to save a new game.
   * @param gameData The game data to be saved
   * @returns The data about the request.
   */
  async saveGame(gameData: any): Promise<boolean> {
    const token = jwt.sign(JWT_SECRET_WS, JWT_SECRET_WS)
    try {
      console.log('Game data sent to server:', gameData)
      await axios.post(`${API_URL}/game`, gameData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      return true
    } catch (error: any) {
      console.error('Error sending game data to server:', error.message)
      return false
    }
  }
}

export default new BackendService()
