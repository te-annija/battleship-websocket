import { WebSocketServer, WebSocket } from 'ws';
import config from 'config';
import GameRoom from './models/GameRoom.js';
import Player from './models/Player.js';
import PlayerAI from './models/PlayerAI.js';
import Ship from './models/Ship.js';

const serverPort: number = config.has('server.ports') ? config.get('server.ports') : 8080;
const wss: WebSocketServer = new WebSocketServer({
  port: serverPort
});
const players: Map<string, Player> = new Map();
const connections: Map<string, WebSocket> = new Map();
const gamerooms: Map<string, GameRoom> = new Map();

wss.on('connection', (ws: WebSocket, request) => {
  console.log('A player connected');

  const cookieUid = getUidFromCookies(request.headers.cookie ?? '');
  const id: string = cookieUid !== '' ? cookieUid : generateRandomString();
  let player: Player | undefined;

  if (players.has(id)) {
    player = players.get(id);

    if (player) {
      handleExistingPlayer(ws, player);
    }
  } else {
    player = new Player(id);
    handleNewPlayer(ws, player);
  }

  ws.on('message', async (data: string) => {
    console.log('received: %s', data);

    if (!player) {
      return;
    }

    player.lastActiveTime = new Date().getTime();

    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(player, message);
    } catch (error: any) {
      console.log(error);
      if (typeof error.message === 'string') {
        sendNotification(ws, 'error', error.message);
      }
    }
  });

  ws.on('close', () => {
    console.log('A player disconnected');
    handlePlayerDisconnect(player);
  });
});

setInterval(closeInactiveConnections, 5 * 60 * 1000);

function getUidFromCookies(cookies: string): string {
  const cookieName = 'uid=';
  try {
    for (const cookie of cookies.split(';')) {
      if (cookie.indexOf(cookieName) == 0) {
        return cookie.substring(cookieName.length, cookie.length);
      }
    }
  } catch (error) {
    console.log(error);
  }
  return '';
}

function generateRandomString(): string {
  let playerID = Math.random().toString(36).substring(4);

  while (players.has(playerID)) {
    playerID = Math.random().toString(36).substring(4);
  }

  return playerID;
}

function sendPlayerData(ws: WebSocket, player: Player): void {
  ws.send(
    JSON.stringify({
      type: 'player',
      data: {
        player: player
      }
    })
  );
}

function sendNotification(ws: WebSocket, type: string, notification: string): void {
  ws.send(
    JSON.stringify({
      type: 'notification',
      data: {
        type: type,
        message: notification
      }
    })
  );
}

function sendAction(ws: WebSocket, type: string): void {
  ws.send(
    JSON.stringify({
      type: type,
      data: null
    })
  );
}

function handleExistingPlayer(ws: WebSocket, player: Player): void {
  sendPlayerData(ws, player);
  connections.set(player.id, ws);

  if (player.gameRoomId && gamerooms.has(player.gameRoomId)) {
    sendAction(ws, 'game-started');

    const gameroom = gamerooms.get(player.gameRoomId);

    if (gameroom) {
      if (gameroom.currentPlayer === player) {
        sendAction(ws, 'player-turn');
      } else {
        sendAction(ws, 'opponent-turn');
      }
    }
  }
}

function handleNewPlayer(ws: WebSocket, player: Player): void {
  sendPlayerData(ws, player);
  players.set(player.id, player);
  connections.set(player.id, ws);
}

function handleWebSocketMessage(player: Player, message: any): void {
  const gameroom =
    player.gameRoomId && gamerooms.has(player.gameRoomId)
      ? gamerooms.get(player.gameRoomId)
      : null;

  const opponent: Player | undefined = gameroom
    ? gameroom.player1 === player
      ? gameroom.player2
      : gameroom.player1
    : undefined;

  const opponentWs: WebSocket | undefined =
    opponent && connections.has(opponent.id) ? connections.get(opponent.id) : undefined;

  switch (message.type) {
    case 'randomize-ships':
      handleRandomizeShips(player, gameroom);
      break;
    case 'reset-ships':
      handleResetShips(player, gameroom);
      break;
    case 'place-ship':
      handlePlaceShip(player, message.data, gameroom);
      break;
    case 'remove-ship':
      handleRemoveShip(player, message.data, gameroom);
      break;
    case 'join-room':
      handleJoinRoom(player, gameroom, opponent, opponentWs);
      break;
    case 'create-room-ai':
      handleCreateRoomAI(player, gameroom);
      break;
    case 'leave-game':
      handleLeaveGame(player, gameroom, opponent, opponentWs);
      break;
    case 'attack-cell':
      handleAttackCell(player, message.data, gameroom, opponent, opponentWs);
      break;
  }
}

function handleRandomizeShips(player: Player, gameroom: GameRoom | null): void {
  if (gameroom) {
    throw new Error('Cannot randomize ships! Game already started');
  }

  player.gameboard.placeShipsRandomly();
  sendPlayerData(connections.get(player.id) as WebSocket, player);
}

function handleResetShips(player: Player, gameroom: GameRoom | null): void {
  if (gameroom) {
    throw new Error('Cannot reset ship! Game already started');
  }

  player.gameboard.cleanBoard();
  sendPlayerData(connections.get(player.id) as WebSocket, player);
}

function handlePlaceShip(player: Player, data: any, gameroom: GameRoom | null): void {
  if (gameroom) {
    throw new Error('Cannot place ship! Game already started');
  }

  if (data.ship_id && data.position) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id);
    if (ship) {
      player.gameboard.placeShip(ship, data.position);
      sendPlayerData(connections.get(player.id) as WebSocket, player);
    }
  }
}

function handleRemoveShip(player: Player, data: any, gameroom: GameRoom | null): void {
  if (gameroom) {
    throw new Error('Cannot remove ship! Game already started');
  }

  if (data.ship_id) {
    const ship: Ship | undefined = player.gameboard.getShipById(data.ship_id);
    if (ship) {
      player.gameboard.cleanBoardOnShip(ship);
      ship.cleanData();
      sendPlayerData(connections.get(player.id) as WebSocket, player);
    }
  }
}

function handleJoinRoom(player: Player,
