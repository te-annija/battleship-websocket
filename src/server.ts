/**
 * FILENAME: server.ts
 * DESCRIPTION: WebSocket server for Battleship game which manages user multiplayer connection
 * AUTHOR: Annija Karitone
 */

import { WebSocketServer, WebSocket } from 'ws'
import Player from './models/Player.js'
import Ship from 'models/Ship.js'
import config from 'config'

const serverPort: number = config.has('server.ports') ? config.get('server.ports') : 8080
const wss: WebSocketServer = new WebSocketServer({
  port: serverPort
})
const players: Map<string, Player> = new Map()
const connections: Map<string, WebSocket> = new Map()

/**
 * Websocket server connection
 */
wss.on('connection', (ws: WebSocket, request) => {
  console.log('A player connected')

  // Handle Player initial data
  const cookieUid = getUidFromCookies(request.headers.cookie ?? '')
  const id: string = cookieUid !== '' ? cookieUid : generateRandomString()
  let player: Player | undefined

  if (players.has(id)) {
    // Player is already started session before
    player = players.get(id)
    if (player) {
      sendPlayerData(ws, player)
      connections.set(id, ws)
    }
  } else {
    // New user session
    player = new Player(id)
    sendPlayerData(ws, player)
    players.set(id, player)
    connections.set(id, ws)
  }

  // Handle WebSocket messages
  ws.on('message', (data: string) => {
    console.log('received: %s', data)

    if (!player) {
      return
    }

    player.lastActiveTime = new Date().getTime()

    try {
      const message = JSON.parse(data)
      console.log(message)
      switch (message.type) {
        case 'randomize-ships':
          player.gameboard.placeShipsRandomly()
          sendPlayerData(ws, player)
          break
        case 'reset-ships':
          player.gameboard.cleanBoard()
          sendPlayerData(ws, player)
          break
        case 'place-ship':
          if (message.data.ship_id && message.data.position) {
            const ship: Ship | undefined = player.gameboard.getShipById(message.data.ship_id)
            if (ship) {
              player.gameboard.placeShip(ship, message.data.position)
              sendPlayerData(ws, player)
            }
          }
          break
        case 'remove-ship':
          if (message.data.ship_id) {
            const ship: Ship | undefined = player.gameboard.getShipById(message.data.ship_id)
            if (ship) {
              player.gameboard.cleanBoardOnShip(ship)
              ship.cleanData()
              sendPlayerData(ws, player)
            }
          }
          break
      }
    } catch (error) {
      console.log(error)
    }
  })

  // Handle WebSocket disconnects
  ws.on('close', () => {
    console.log('A player disconnected')
  })
})

// Close inactive connections every 5 minutes
setInterval(closeInactiveConnections, 5 * 60 * 1000)

/**
 * Get user ID from the cookie.
 * @param cookies Cookies from the request header data.
 * @returns Returns user ID.
 */
function getUidFromCookies(cookies: string): string {
  const cookieName = 'uid='
  try {
    for (const cookie of cookies.split(';')) {
      if (cookie.indexOf(cookieName) == 0) {
        return cookie.substring(cookieName.length, cookie.length)
      }
    }
  } catch (error) {
    console.log(error)
  }
  return ''
}

/**
 * Return randomly generated string and checks if no user is assigned already.
 * @returns Randomly generated user ID.
 */
function generateRandomString(): string {
  let playerID = Math.random().toString(36).substring(4)

  while (players.has(playerID)) {
    playerID = Math.random().toString(36).substring(4)
  }

  return playerID
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

/**
 * Check and close inactive connections if user is not reached Websocket in 15 minutes
 */
function closeInactiveConnections() {
  const currentTime = new Date().getTime()
  connections.forEach((ws, playerId) => {
    const player = players.get(playerId)
    const playerLastActiveTime = player ? player.lastActiveTime : 0
    const fifteenMin = 15 * 60 * 1000
    if (currentTime - playerLastActiveTime > fifteenMin) {
      ws.close()
      players.delete(playerId)
      connections.delete(playerId)
      console.log(`Closed inactive connection for player ${playerId}`)
    }
  })
}
