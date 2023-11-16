/**
 * FILENAME: server.ts
 * DESCRIPTION: File contains of responses for all requested actions from the user.
 * AUTHOR: Annija Karitone
 */

import { WebSocket } from 'ws'
import Player from './models/Player.js'
import GameRoom from './models/GameRoom.js'
import Ship from './models/Ship.js'
import PlayerAI from './models/PlayerAI.js'

/**
 * Handle the player data if existing session needs to be restored.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 */
export function handlePlayerSessionStart(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined = undefined
) {
  sendPlayerData(ws, player)
  if (gameroom && gameroom.isGameStarted) {
    sendAction(ws, 'game-started')

    if (gameroom.currentPlayer === player) {
      sendAction(ws, 'player-turn')
    } else {
      sendAction(ws, 'opponent-turn')
    }
  }
}

/**
 * Hanlde place ships randomly on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 */
export function handleRandomizeShips(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined
): void {
  if (gameroom && gameroom.isGameStarted) {
    throw new Error('Cannot randomize ships! Game already started')
  }

  player.gameboard.placeShipsRandomly()
  sendPlayerData(ws, player)
}

/**
 * Handle remove all ships from board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 */
export function handleResetShips(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined
): void {
  if (gameroom && gameroom.isGameStarted) {
    throw new Error('Cannot reset ship! Game already started')
  }

  player.gameboard.cleanBoard()
  sendPlayerData(ws, player)
}

/**
 * Handle place one ship on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param data The data about the ship that needs to be placed.
 */
export function handlePlaceShip(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined,
  data: any
): void {
  if (gameroom && gameroom.isGameStarted) {
    throw new Error('Cannot place ship! Game already started.')
  }

  if (data && data.ship_id && data.position) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id)
    if (ship) {
      player.gameboard.placeShip(ship, data.position)
      sendPlayerData(ws, player)
      return
    }
  }

  throw new Error('Error while placing a ship. Please try again.')
}

/**
 * Handle remove one ship on board and update the player.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param data The data about the ship that needs to be removed.
 */
export function handleRemoveShip(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined,
  data: any
): void {
  if (gameroom && gameroom.isGameStarted) {
    throw new Error('Cannot remove ship! Game already started.')
  }

  if (data && data.ship_id) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id)
    if (ship) {
      player.gameboard.cleanBoardOnShip(ship)
      ship.cleanData()
      sendPlayerData(ws, player)
      return
    }
  }

  throw new Error('Error while removing a ship. Please try again.')
}

/**
 * Handle creating a gameroom where player will be the host.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroomId The unique identifier for the new gameroom.
 * @param data Data indicating the requested gameroom type (eg., 'random', 'friend', 'computer').
 */
export function handleCreateRoom(
  ws: WebSocket,
  player: Player,
  gameroomId: string,
  data: any
): GameRoom {
  if (!player.gameboard.isAllShipsOnBoard()) {
    throw new Error('Place ships before starting a new game.')
  }

  const roomType = data && data.type ? data.type : 'random'
  const newGameroom = new GameRoom(gameroomId, player, roomType)
  player.gameRoomId = newGameroom.id
  sendAction(ws, 'game-created', { id: newGameroom.id, type: roomType })
  sendAction(ws, 'player-joined')

  return newGameroom
}

/**
 * Handle joining to already created gameroom and updating opponent data.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param opponentWS Current connection to opponent websocket.
 */
export function handleJoinRoom(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom,
  opponentWs: WebSocket | undefined
): void {
  if (!gameroom.player1) {
    throw new Error('Failed to join the gameroom. Host disconnected.')
  }

  if (gameroom.player1 === player) {
    //Host is rejoining the gameroom.
    player.gameRoomId = gameroom.id
    sendAction(ws, 'player-joined')
    if (gameroom.player2) {
      sendOpponentData(ws, gameroom.player2)
    }
  } else {
    // Player that is not the host is joining or rejoining the gameroom.
    player.gameRoomId = gameroom.id
    sendAction(ws, 'player-joined')
    gameroom.player2 = player

    sendOpponentData(ws, gameroom.player1)
  }

  if (opponentWs) {
    // Notify the opponent that the player is joined.
    sendOpponentData(opponentWs, player)
  }
}

/**
 * Handle game start request and notify players about turns.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param opponentWS Current connection to opponent websocket.
 */
export function handleStartGame(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom,
  opponentWs: WebSocket
) {
  if (gameroom.type === 'friend' && !gameroom.isReady()) {
    throw new Error('Cannot start the game. All players are not ready yet!')
  }

  if (!player.gameboard.isAllShipsOnBoard) {
    throw new Error('Cannot start the game. All ships are not placed.')
  }

  gameroom.isGameStarted = true
  if (gameroom.player1 && gameroom.player2) {
    gameroom.currentPlayer = Math.random() < 0.5 ? gameroom.player1 : gameroom.player2 //Choose player to start randomly
  }

  if (gameroom.currentPlayer === player) {
    sendAction(ws, 'player-turn')
    sendAction(opponentWs, 'opponent-turn')
  } else {
    sendAction(opponentWs, 'player-turn')
    sendAction(ws, 'opponent-turn')
  }

  sendAction(ws, 'game-started')
  sendAction(opponentWs, 'game-started')
}

/**
 * Handle add AI player if the game is against the computer.
 *
 * @param ws Current connection websocket.
 * @param gameroom The current gameroom where player is connected.
 * @param PlayerAIId The unique identifier for the AI.
 */
export function handleAddAIPlayer(ws: WebSocket, gameroom: GameRoom, PlayerAIId: string): void {
  if (gameroom.type === 'computer') {
    gameroom.playerAI = new PlayerAI(PlayerAIId)
    sendAction(ws, 'game-started')
  }
}

/**
 * Handle game leave, clean up data and notify players.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param opponentWS Current connection to opponent websocket.
 */
export function handleLeaveGame(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined,
  opponentWs: WebSocket | undefined
): void {
  if (gameroom) {
    if (gameroom.isGameStarted) {
      player.gameboard.cleanBoard()
      player.enemyGameboard.cleanBoard()
    }

    if (gameroom.player1 && gameroom.player1.id === player.id) {
      gameroom.player1 = undefined
    } else {
      gameroom.player2 = undefined
    }

    player.gameRoomId = undefined
  }

  sendPlayerData(ws, player)

  if (opponentWs) {
    sendAction(opponentWs, 'opponent-disconnected')

    if (gameroom && !gameroom.player1 && !gameroom.isGameStarted) {
      sendAction(opponentWs, 'host-disconnected')
    }
  }
}

/**
 * Handle ready to start the game for friend gameroom.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param opponentWS Current connection to opponent websocket.
 * @param data The data indicating if player is ready to start the game.
 */
export async function handleReady(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined,
  opponentWs: WebSocket | undefined,
  data: any
) {
  if (!gameroom || !opponentWs || !data) {
    throw new Error('Could not change ready status')
  }

  gameroom.setPlayerReadyStatus(player.id, data.status)
  sendOpponentData(opponentWs, player, data.status)

  if (gameroom.isReady()) {
    // Both players are ready, start the game
    handleStartGame(ws, player, gameroom, opponentWs)
  }
}

/**
 * Handle attack single cell on the enemy gameboard and notify players.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
 * @param gameroom The current gameroom where player is connected.
 * @param data The data indicating if player is ready to start the game.
 * @param opponent Current data about the opponent.
 * @param opponentWS Current connection to opponent websocket.
 */
export async function handleAttackCell(
  ws: WebSocket,
  player: Player,
  gameroom: GameRoom | undefined,
  data: any,
  opponent: Player | undefined,
  opponentWs: WebSocket | undefined
): Promise<void> {
  // Check if player can attack opponent.
  if (!gameroom) {
    throw new Error('Gameroom is not created. Please create a new game.')
  }

  if ((!opponentWs || !opponent) && !gameroom.playerAI) {
    player.gameboard.cleanBoard()
    player.enemyGameboard.cleanBoard()
    sendAction(ws, 'opponent-disconnected')
    throw new Error('Opponent disconnected!')
  }

  if (gameroom.currentPlayer !== player) {
    throw new Error('This is not your turn. Please wait!')
  }

  if (!data) {
    throw new Error('Something went wrong, please retry attack!')
  }

  // Make an attack and return if it was invalid.
  if (!gameroom.makeAttack(data.row, data.col)) {
    throw new Error('Please provide valid attacking coordinates!')
  }

  // Notify players about the results.
  sendPlayerData(ws, player)

  if (opponent && opponentWs) {
    sendPlayerData(opponentWs, opponent)
  }

  if (gameroom.currentPlayer === player) {
    sendAction(ws, 'player-turn')
  } else {
    sendAction(ws, 'opponent-turn')

    if (opponentWs) {
      sendAction(opponentWs, 'player-turn')
    }
  }

  // AI attack to the player if game is against computer.
  if (gameroom.currentPlayer !== player && gameroom.playerAI) {
    while (gameroom.currentPlayer.id === gameroom.playerAI.id) {
      gameroom.makeAIAttack()
      await delay(1000)
      sendPlayerData(ws, player)
    }
    sendAction(ws, 'player-turn')
  }
}

/**
 * Sends player data to the connection.
 *
 * @param ws Current connection websocket.
 * @param player Current data about player.
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
 * Sends opponent data to the connection.
 *
 * @param ws Current connection websocket.
 * @param opponent Current data about player's opponent.
 * @param isReady True if opponent is ready to start the game.
 */
function sendOpponentData(ws: WebSocket, opponent: Player, isReady: boolean = false): void {
  ws.send(
    JSON.stringify({
      type: 'opponent',
      data: {
        id: opponent.id,
        name: opponent.name,
        isReady: isReady
      }
    })
  )
}

/**
 * Sends a simple action to the player.
 *
 * @param ws Current connection websocket.
 * @param type The action to perform.
 * @param data The data to sent to connection.
 */
function sendAction(ws: WebSocket, type: string, data: any = null): void {
  ws.send(
    JSON.stringify({
      type: type,
      data: data
    })
  )
}

/**
 * Helper function to timeout the code execution.
 * @param ms Time in miliseconds.
 */
async function delay(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
