let board = null;
let game = new Chess();
let ws = null;
let playerColor = 'white'; // 'white' or 'black'
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
        switch (data.type) {
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
            case 'draw_offer': // Added draw offer handling
                handleDrawOffer(data);
                break;
            case 'draw_response': // Added draw response handling
                handleDrawResponse(data);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
        showError('Error processing server message');
    }
}

// Initialize the game board
function initializeBoard(orientation) { // Added orientation parameter
    if (board) {
        board.destroy(); // Destroy existing board instance to reset it
    }

    const config = {
        draggable: true, // KEEP DRAG AND DROP ENABLED for multiplayer
        position: 'start',
        orientation: orientation, // Use the passed orientation
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        showNotation: true // Keep notation visible
    };

    board = Chessboard('board', config);
    $(window).resize(() => {
        board.resize();
    });
    updateStatus();
    console.log("Board initialized with orientation:", orientation);
}

// Handle room creation
function handleRoomCreated(data) {
    currentRoom = data.roomId;
    playerColor = data.color; // 'white' or 'black'
    $('#currentRoom').text(currentRoom);
    $('#playerColor').text(playerColor);
    $('#roomControls').hide();
    $('#gameArea').show();
    showStatus('Waiting for opponent to join...', 'info');
    initializeBoard(playerColor); // Initialize board with player's color
}

// Handle game start
function handleGameStart(data) {
    console.log('Game starting:', data);
    currentRoom = data.roomId;
    playerColor = data.color; // 'white' or 'black'
    game = new Chess(); // Reset the game state
    
    // Initialize the board with the correct orientation before setting turn
    initializeBoard(playerColor); // This ensures 'board' object is created

    isMyTurn = (playerColor === 'white' && game.turn() === 'w') || (playerColor === 'black' && game.turn() === 'b');
    
    $('#currentRoom').text(currentRoom);
    $('#playerColor').text(playerColor);
    $('#roomControls').hide();
    $('#gameArea').show();

    showStatus(isMyTurn ? 'Your turn' : "Opponent's turn", 'info');
    enableGameControls();
}

// Handle moves made by either player
function handleMoveMade(data) {
    console.log('Applying opponent move:', data.move);
    game.move(data.move);
    board.position(game.fen());
    isMyTurn = true; // After opponent's move, it becomes your turn
    playMoveSound(data.move);
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
        move: move, // Send the verbose move object
        fen: game.fen(),
        roomId: currentRoom
    }));

    addMoveToHistory(move);
    updateStatus();
    return true; // Indicate that the move was valid for chessboard.js
}

// Update piece positions after snap animation
function onSnapEnd() {
    board.position(game.fen());
}

function playMoveSound(move) {
    const audio = new Audio();
    if (move.captured) {
        audio.src = 'https://lichess1.org/assets/sound/standard/Capture.ogg';
    } else if (move.san.includes('+')) {
        audio.src = 'https://lichess1.org/assets/sound/standard/Check.ogg';
    } else {
        audio.src = 'https://lichess1.org/assets/sound/standard/Move.ogg';
    }
    audio.play().catch(() => { /* console.error("Audio playback failed:", error); */ });
}

// Add move to the move history
function addMoveToHistory(move) {
    const moveText = `${move.from}-${move.to}`; // Simplified for now, consider using move.san
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
        status = (isMyTurn ? 'Your turn' : "Opponent's turn');
        if (game.in_check()) {
            status += ', ' + (game.turn() === 'w' ? 'White' : 'Black') + ' is in check';
        }
    }

    showStatus(status, 'info');
    $('#gameStatusText').text(status); // Ensure this updates the text element
}

// Handle game end
function handleGameEnd(result) {
    ws.send(JSON.stringify({
        type: 'game_over',
        result: result,
        roomId: currentRoom // Send roomId for the server to handle
    }));
    disableGameControls();
}

// NEW: Handle Draw Offer (client-side confirmation)
function handleDrawOffer(data) {
    if (data.fromColor !== playerColor) { // If offer is from opponent
        if (confirm(`Opponent offers a draw. Do you accept?`)) {
            ws.send(JSON.stringify({
                type: 'draw_response',
                roomId: currentRoom,
                accepted: true
            }));
            showStatus('Draw accepted. Game is a draw!', 'info');
            game.reset(); // Reset game state for draw
            board.start(); // Reset visual board
            $('#moveHistory').empty();
            disableGameControls();
        } else {
            ws.send(JSON.stringify({
                type: 'draw_response',
                roomId: currentRoom,
                accepted: false
            }));
            showStatus('Draw declined.', 'info');
        }
    }
}

// NEW: Handle Draw Response
function handleDrawResponse(data) {
    if (data.accepted) {
        showStatus('Opponent accepted the draw. Game is a draw!', 'info');
        game.reset();
        board.start();
        $('#moveHistory').empty();
        disableGameControls();
    } else {
        showStatus('Opponent declined the draw.', 'info');
    }
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
    // Connect to server when page loads
    connectToServer();

    // Initial chessboard setup when the page loads, using a default 'white' orientation
    // This ensures 'board' is initialized and ready for first interactions.
    initializeBoard('white'); 

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
            // Call handleGameOver directly for immediate client-side update
            handleGameOver({ result: `${playerColor} resigned. ${playerColor === 'white' ? 'Black' : 'White'} wins!` });
        }
    });

    // Draw button click handler
    $('#offerDrawBtn').click(() => {
        if (currentRoom && isConnected) {
            ws.send(JSON.stringify({
                type: 'offer_draw',
                roomId: currentRoom,
                fromColor: playerColor // Send who is offering the draw
            }));
            showStatus('Draw offered to opponent', 'info');
        }
    });
});
