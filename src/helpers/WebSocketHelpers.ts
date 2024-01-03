import { WebSocket } from 'ws'
import Player from '../models/Player.js'
import Gameboard from '../models/Gameboard.js'

/**
 * Sends a simple action to the player.
 * @param ws Current connection websocket.
 * @param type The action to perform.
 * @param data The data to sent to connection.
 */
export function sendAction(ws: WebSocket, type: string, data: any = null): void {
  ws.send(
    JSON.stringify({
      type: type,
      data: data
    })
  )
}

/**
 * Sends player data to the connection.
 * @param ws Current connection websocket.
 * @param player Current data about player.
 */
export function sendPlayerData(ws: WebSocket, player: Player): void {
  ws.send(
    JSON.stringify({
      type: 'player',
      data: {
        player
      }
    })
  )
}

/**
 * Sends opponent data to the connection.
 * @param ws Current connection websocket.
 * @param opponent Current data about player's opponent.
 */
export function sendOpponentData(ws: WebSocket, opponent: Player): void {
  ws.send(
    JSON.stringify({
      type: 'opponent',
      data: {
        playerId: opponent.playerId,
        username: opponent.username,
        isReady: opponent.isReady
      }
    })
  )
}

/**
 * Sends gameboard data to the connection.
 * @param ws Current connection websocket.
 * @param gameboard Current data about player's gameboard.
 * @param type The gameboard type.
 */
export function sendGameboardData(
  ws: WebSocket,
  gameboard: Gameboard,
  type: string = 'player'
): void {
  ws.send(
    JSON.stringify({
      type: 'gameboard',
      data: {
        gameboard,
        type
      }
    })
  )
}
