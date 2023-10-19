/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import Player from './models/Player.js'
import config from 'config'

const wss: WebSocketServer = new WebSocketServer({
  port: config.has('server.port') ? config.get('server.port') : 8080
})
const players: Map<string, Player> = new Map()
const connetions: Map<string, WebSocket> = new Map()

/**
 * Websocket server connection
 */
wss.on('connection', (ws: WebSocket) => {
  console.log('A player connected')

  // Handle Player initial data
  let player = createNewPlayer()
  players.set(player.id, player)
  connetions.set(player.id, ws)

  sendPlayerData(ws, player)

  // Handle WebSocket messages
  ws.on('message', (data: string) => {
    console.log('received: %s', data)
  })

  // Handle WebSocket disconnects
  ws.on('close', () => {
    console.log('A player disconnected')
    players.delete(player.id)
    connetions.delete(player.id)
  })
})

/**
 * Creates a new player object
 *
 * @returns The player object
 */
function createNewPlayer(): Player {
  const playerId = Math.random().toString(36).substring(4)
  return new Player(playerId)
}

/**
 * Sends player data to the connection
 *
 * @param ws Current connection websocket
 * @param player Current data about player
 */
function sendPlayerData(ws: WebSocket, player: Player): void {
  ws.send(
    JSON.stringify({
      type: 'player',
      data: {
        player: player
      }
    })
  )
}
