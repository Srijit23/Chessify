
let board = null;
let game = new Chess();
let ws = null;
let playerColor = 'white';
let currentRoom = '';
let isMyTurn = false;
let isConnected = false;

// Connect to WebSocket server
function connectToServer() {
    try {
        // Always connect to your deployed WebSocket backend
        const wsUrl = 'wss://chessify1-server.onrender.com';

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to server');
            isConnected = true;
            $('#createRoom, #joinRoom').prop('disabled', false);
            showStatus('Connected to server', 'success');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Received:', data);
            handleServerMessage(data);
        };

        ws.onclose = () => {
            console.log('Disconnected from server');
            isConnected = false;
            $('#createRoom, #joinRoom').prop('disabled', true);
            showError('Connection lost. Please refresh the page to reconnect.');
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showError('Connection error. Please check if the server is running.');
        };
    } catch (error) {
        console.error('Connection error:', error);
        showError('Failed to connect to server. Please check if the server is running.');
    }
}


// Show status message
function showStatus(message, type = 'info') {
    const alert = $('#gameStatus');
    alert.removeClass().addClass(`alert alert-${type} mt-3`).text(message);
}

// Show error message
function showError(message) {
    showStatus(message, 'danger');
}

// Handle incoming server messages
function handleServerMessage(data) {
    try {
        console.log('Handling message:', data);
        switch(data.type) {
            case 'room_created':
                handleRoomCreated(data);
                break;
            case 'game_start':
                handleGameStart(data);
                break;
            case 'move_made':
                handleMoveMade(data);
                break;
            case 'game_over':
                handleGameOver(data);
                break;
            case 'player_disconnected':
                handlePlayerDisconnect(data);
                break;
            case 'error':
                showError(data.message);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
        showError('Error processing server message');
    }
}

function initializeBoard() {
    console.log("Initializing board...");

    const config = {
        draggable: false, // DRAG AND DROP DISABLED
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        showNotation: true
    };

    board = Chessboard('board', config);

    $(window).resize(() => {
        board.resize();
        // Optional: Re-bind handlers on resize. Could be overkill, but ensures robustness.
        // bindSquareClickHandlers();
    });
   

    // Initial binding of click handlers after board setup
    // Use a small timeout to ensure DOM elements are fully in place
    setTimeout(bindSquareClickHandlers, 500);
}


// Handle room creation
function handleRoomCreated(data) {
    currentRoom = data.roomId;
    playerColor = data.color;
    $('#currentRoom').text(currentRoom);
    $('#playerColor').text(playerColor);
    $('#roomControls').hide();
    $('#gameArea').show();
    showStatus('Waiting for opponent to join...', 'info');
    initializeBoard();
}

// Handle game start
function handleGameStart(data) {
    console.log('Game starting:', data);
    currentRoom = data.roomId;
    playerColor = data.color;
    isMyTurn = playerColor === 'white';
    
    $('#currentRoom').text(currentRoom);
    $('#playerColor').text(playerColor);
    $('#roomControls').hide();
    $('#gameArea').show();
    
    // Reset the game state
    game = new Chess();
    initializeBoard();
    
    showStatus(isMyTurn ? 'Your turn' : "Opponent's turn", 'info');
    enableGameControls();
}

// Handle moves made by either player
function handleMoveMade(data) {
    game.move(data.move);
    board.position(game.fen());
    isMyTurn = true;
    addMoveToHistory(data.move);
    updateStatus();
}

// Handle game over
function handleGameOver(data) {
    showStatus(data.result, 'info');
    disableGameControls();
}

// Handle player disconnection
function handlePlayerDisconnect(data) {
    showError(`${data.color} player has disconnected`);
    disableGameControls();
}

// Check if it's the player's turn
function onDragStart(source, piece) {
    if (game.game_over() || !isMyTurn ||
        (playerColor === 'white' && piece.search(/^b/) !== -1) ||
        (playerColor === 'black' && piece.search(/^w/) !== -1)) {
        return false;
    }
    return true;
}

// Handle piece drops
function onDrop(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });
    
    if (move === null) return 'snapback';
    
    isMyTurn = false;
    ws.send(JSON.stringify({
        type: 'make_move',
        move: move,
        fen: game.fen()
    }));
    
    addMoveToHistory(move);
    updateStatus();
}

// Update piece positions after snap animation
function onSnapEnd() {
    board.position(game.fen());
}

// Add move to the move history
function addMoveToHistory(move) {
    const moveText = `${move.from}-${move.to}`;
    const $moveHistory = $('#moveHistory');
    const $moveItem = $('<div>').addClass('move-item').text(moveText);
    
    $('.move-item').removeClass('latest-move');
    $moveItem.addClass('latest-move');
    $moveHistory.append($moveItem);
    $moveHistory.scrollTop($moveHistory[0].scrollHeight);
}

// Update game status
function updateStatus() {
    let status = '';
    
    if (game.in_checkmate()) {
        status = 'Game over, ' + (game.turn() === 'w' ? 'black' : 'white') + ' wins by checkmate!';
        handleGameEnd(status);
    } else if (game.in_draw()) {
        status = 'Game over, drawn position!';
        handleGameEnd(status);
    } else {
        status = (isMyTurn ? 'Your turn' : "Opponent's turn");
        if (game.in_check()) {
            status += ', ' + (game.turn() === 'w' ? 'White' : 'Black') + ' is in check';
        }
    }
    
    showStatus(status, 'info');
    $('#gameStatusText').text(status);
}

// Handle game end
function handleGameEnd(result) {
    ws.send(JSON.stringify({
        type: 'game_over',
        result: result
    }));
    disableGameControls();
}

// Enable game controls
function enableGameControls() {
    $('#resignBtn, #offerDrawBtn').prop('disabled', false);
}

// Disable game controls
function disableGameControls() {
    $('#resignBtn, #offerDrawBtn').prop('disabled', true);
}

// Event listeners
$(document).ready(() => {
    // Initialize the board
    board = Chessboard('board', {
        position: 'start',
        draggable: true,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    });

    // Create room button click handler
    $('#createRoom').click(() => {
        if (!isConnected) {
            showError('Not connected to server');
            return;
        }
        
        const roomId = Math.random().toString(36).substring(2, 8);
        ws.send(JSON.stringify({
            type: 'create_room',
            roomId: roomId
        }));
        
        currentRoom = roomId;
        $('#currentRoom').text(roomId);
    });

    // Join room button click handler
    $('#joinRoom').click(() => {
        if (!isConnected) {
            showError('Not connected to server');
            return;
        }
        
        const roomId = $('#roomId').val().trim();
        if (!roomId) {
            showError('Please enter a room ID');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'join_room',
            roomId: roomId
        }));
        
        currentRoom = roomId;
        $('#currentRoom').text(roomId);
    });

    // Resign button click handler
    $('#resignBtn').click(() => {
        if (currentRoom && isConnected) {
            ws.send(JSON.stringify({
                type: 'game_over',
                roomId: currentRoom,
                result: 'resign',
                winner: playerColor === 'white' ? 'black' : 'white'
            }));
            handleGameEnd('resign');
        }
    });

    // Draw button click handler
    $('#offerDrawBtn').click(() => {
        if (currentRoom && isConnected) {
            ws.send(JSON.stringify({
                type: 'offer_draw',
                roomId: currentRoom
            }));
            showStatus('Draw offered to opponent', 'info');
        }
    });
});

// Connect to server when page loads
connectToServer();
