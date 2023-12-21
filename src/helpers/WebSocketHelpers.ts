import { WebSocket } from 'ws'
import Player from '../models/Player.js'

/**
 * Sends a simple action to the player.
 *
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
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 */
export function sendPlayerData(ws: WebSocket, player: Player, isReady: boolean = false): void {
  ws.send(
    JSON.stringify({
      type: 'player',
      data: {
        player: {
          ...player,
          isReady: isReady
        }
      }
    })
  )
}

/**
 * Sends opponent data to the connection.
 *
 * @param ws Current connection websocket.
 * @param opponent Current data about player's opponent.
 * @param isReady True if opponent is ready to start the game.
 */
export function sendOpponentData(ws: WebSocket, opponent: Player, isReady: boolean = false): void {
  ws.send(
    JSON.stringify({
      type: 'opponent',
      data: {
        id: opponent.id,
        username: opponent.username,
        isReady: isReady
      }
    })
  )
}
