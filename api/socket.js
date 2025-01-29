import { startGame, getGameState } from './api.js';

startGame().then(data => console.log(data));

const { Server } = require('ws');
let wss;

// Store active game rooms
const gameRooms = new Map();

const socket = (req, res) => {
    if (!wss) {
        wss = new Server({ noServer: true });
        
        wss.on('connection', (ws) => {
            console.log('Client connected');
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log('Received:', data);
                    
                    switch(data.type) {
                        case 'create_room':
                            handleCreateRoom(ws, data);
                            break;
                        case 'join_room':
                            handleJoinRoom(ws, data);
                            break;
                        case 'make_move':
                            handleMove(ws, data);
                            break;
                        case 'game_over':
                            handleGameOver(ws, data);
                            break;
                    }
                    
                } catch (error) {
                    console.error('Error processing message:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Server error: ' + error.message
                    }));
                }
            });
            
            ws.on('close', () => {
                handlePlayerDisconnect(ws);
                console.log('Client disconnected');
            });
        });
    }
    
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
        wss.emit('connection', ws, req);
    });
};

function handleCreateRoom(ws, data) {
    const roomId = data.roomId;
    
    if (gameRooms.has(roomId)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room already exists'
        }));
        return;
    }
    
    gameRooms.set(roomId, {
        white: ws,
        black: null,
        spectators: [],
        gameState: {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            moves: []
        }
    });
    
    ws.roomId = roomId;
    ws.color = 'white';
    
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId,
        color: 'white'
    }));
}

function handleJoinRoom(ws, data) {
    const roomId = data.roomId;
    const room = gameRooms.get(roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
        }));
        return;
    }
    
    if (!room.black) {
        room.black = ws;
        ws.roomId = roomId;
        ws.color = 'black';
        
        room.white.send(JSON.stringify({
            type: 'game_start',
            roomId: roomId,
            color: 'white',
            fen: room.gameState.fen
        }));
        
        ws.send(JSON.stringify({
            type: 'game_start',
            roomId: roomId,
            color: 'black',
            fen: room.gameState.fen
        }));
    } else {
        room.spectators.push(ws);
        ws.roomId = roomId;
        ws.isSpectator = true;
        
        ws.send(JSON.stringify({
            type: 'spectate_start',
            roomId: roomId,
            fen: room.gameState.fen
        }));
    }
}

function handleMove(ws, data) {
    const room = gameRooms.get(ws.roomId);
    if (!room) return;
    
    room.gameState.fen = data.fen;
    room.gameState.moves.push(data.move);
    
    const moveData = JSON.stringify({
        type: 'move_made',
        move: data.move,
        fen: data.fen
    });
    
    if (room.white) room.white.send(moveData);
    if (room.black) room.black.send(moveData);
    room.spectators.forEach(spectator => spectator.send(moveData));
}

function handleGameOver(ws, data) {
    const room = gameRooms.get(ws.roomId);
    if (!room) return;
    
    const gameOverData = JSON.stringify({
        type: 'game_over',
        result: data.result
    });
    
    if (room.white) room.white.send(gameOverData);
    if (room.black) room.black.send(gameOverData);
    room.spectators.forEach(spectator => spectator.send(gameOverData));
}

function handlePlayerDisconnect(ws) {
    const roomId = ws.roomId;
    if (!roomId) return;
    
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    const disconnectData = JSON.stringify({
        type: 'player_disconnected',
        color: ws.color
    });
    
    if (ws === room.white) {
        room.white = null;
        if (room.black) room.black.send(disconnectData);
    } else if (ws === room.black) {
        room.black = null;
        if (room.white) room.white.send(disconnectData);
    } else {
        room.spectators = room.spectators.filter(spec => spec !== ws);
    }
    
    if (!room.white && !room.black && room.spectators.length === 0) {
        gameRooms.delete(roomId);
    }
}

module.exports = socket;
