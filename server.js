const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store active game rooms
const gameRooms = new Map();

// Log active rooms
function logRooms() {
    console.log('\nActive Rooms:');
    gameRooms.forEach((room, roomId) => {
        console.log(`Room ${roomId}:`);
        console.log('- White player:', room.white ? 'Connected' : 'Empty');
        console.log('- Black player:', room.black ? 'Connected' : 'Empty');
        console.log('- Spectators:', room.spectators.length);
    });
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    
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
                default:
                    console.log('Unknown message type:', data.type);
            }
            
            // Log rooms after each action
            logRooms();
            
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
        logRooms();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleCreateRoom(ws, data) {
    const roomId = data.roomId;
    console.log('Creating room:', roomId);
    
    if (gameRooms.has(roomId)) {
        console.log('Room already exists:', roomId);
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
    
    console.log('Room created:', roomId);
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId,
        color: 'white'
    }));
}

function handleJoinRoom(ws, data) {
    const roomId = data.roomId;
    console.log('Joining room:', roomId);
    
    const room = gameRooms.get(roomId);
    
    if (!room) {
        console.log('Room not found:', roomId);
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
        
        console.log('Black player joined room:', roomId);
        
        // Notify both players that game can start
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
        // Add as spectator
        room.spectators.push(ws);
        ws.roomId = roomId;
        ws.isSpectator = true;
        
        console.log('Spectator joined room:', roomId);
        ws.send(JSON.stringify({
            type: 'spectate_start',
            roomId: roomId,
            fen: room.gameState.fen
        }));
    }
}

function handleMove(ws, data) {
    const room = gameRooms.get(ws.roomId);
    if (!room) {
        console.log('Room not found for move:', ws.roomId);
        return;
    }
    
    // Update game state
    room.gameState.fen = data.fen;
    room.gameState.moves.push(data.move);
    
    console.log('Move made in room', ws.roomId, ':', data.move);
    
    // Broadcast move to all players in room
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
    
    console.log('Game over in room', ws.roomId, ':', data.result);
    
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
    
    console.log('Player disconnected from room:', roomId);
    
    // Notify other player about disconnection
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
        // Remove spectator
        room.spectators = room.spectators.filter(spec => spec !== ws);
    }
    
    // If both players are gone and no spectators, remove the room
    if (!room.white && !room.black && room.spectators.length === 0) {
        console.log('Removing empty room:', roomId);
        gameRooms.delete(roomId);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
