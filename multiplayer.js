let board = null;
let game = new Chess();
let ws = null;
let playerColor = 'white'; // 'white' or 'black'
let currentRoom = '';
let isMyTurn = false;
let isConnected = false;
let tapSquare = null; // Stores the square of the currently selected piece for tap-to-move

// Connect to WebSocket server
function connectToServer() {
    try {
        const wsUrl = 'wss://chessify1-server.onrender.com';

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to server');
            isConnected = true;
            // ENABLE buttons ONLY when connected
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
            // DISABLE buttons when disconnected
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
            case 'draw_offer':
                handleDrawOffer(data);
                break;
            case 'draw_response':
                handleDrawResponse(data);
                break;
            case 'chat_message': // Handle chat messages
                addChatMessage(data.message, data.sender);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
        showError('Error processing server message');
    }
}

// Click handling logic for squares
function handleSquareClick(event) {
    const clickedSquare = this.getAttribute('data-square');
    console.log("Clicked square:", clickedSquare);

    if (!isMyTurn || game.game_over()) {
        console.log("Interaction blocked: Not your turn or game over.");
        return;
    }

    // Scenario 1: No piece is currently selected for tap-to-move
    if (tapSquare === null) {
        const piece = game.get(clickedSquare);
        // Only allow selecting a piece if it's the user's turn and their color
        if (piece && piece.color === playerColor.charAt(0) && game.turn() === playerColor.charAt(0)) {
            tapSquare = clickedSquare;
            highlightLegalMoves(tapSquare); // Highlight the selected piece AND its legal moves
            console.log("Piece selected:", tapSquare);
        } else {
            console.log("Cannot select: no piece, not your piece, or not your turn.");
            removeHighlights(); // Ensure no lingering highlights if invalid tap
        }
    } else {
        // Scenario 2: A piece is already selected (tapSquare is not null)
        // Check if the user clicked the same square (to deselect)
        if (clickedSquare === tapSquare) {
            deselectPiece();
            console.log("Piece deselected.");
        } else {
            // Attempt to move the selected piece to the new square
            const moveAttempt = {
                from: tapSquare,
                to: clickedSquare,
                promotion: 'q' // Default to queen promotion
            };

            const moveResult = game.move(moveAttempt);

            if (moveResult === null) {
                // Invalid move. Check if the clicked square contains a piece of the user's color
                const newPiece = game.get(clickedSquare);
                if (newPiece && newPiece.color === playerColor.charAt(0) && game.turn() === playerColor.charAt(0)) {
                    // User clicked on another of their own pieces, so select the new one
                    deselectPiece(); // Deselect old piece
                    tapSquare = clickedSquare; // Select new piece
                    highlightLegalMoves(tapSquare); // Highlight new piece and its moves
                    console.log("Invalid move, selecting new piece:", clickedSquare);
                } else {
                    // User clicked on an empty square where no valid move was possible, or an opponent's piece.
                    // Deselect the previously selected piece.
                    deselectPiece();
                    console.log("Invalid move, deselecting piece.");
                }
            } else {
                // Valid move. Send it to the server.
                isMyTurn = false; // It's no longer your turn
                ws.send(JSON.stringify({
                    type: 'make_move',
                    move: moveResult, // Send the verbose move object
                    fen: game.fen(),
                    roomId: currentRoom
                }));

                board.position(game.fen()); // Update the visual board immediately
                playMoveSound(moveResult);
                addMoveToHistory(moveResult);
                updateStatus();
                deselectPiece(); // Deselect after a successful move
                console.log("Move made and sent to server:", moveResult);
            }
        }
    }
}

// Function to bind/re-bind square click handlers
function bindSquareClickHandlers() {
    const squares = document.querySelectorAll('#board .square-55d63');
    squares.forEach(square => {
        square.removeEventListener('click', handleSquareClick); // Remove existing
        square.addEventListener('click', handleSquareClick); // Add new
    });
    console.log("Square click handlers bound.");
}

// Highlighting functions
function highlightLegalMoves(sourceSquare) {
    removeHighlights(); // Always start by removing previous highlights

    // Add highlight for the selected piece itself
    $(`[data-square='${sourceSquare}']`).addClass('highlight-selected');

    // Get all legal moves for the piece on the sourceSquare
    const legalMoves = game.moves({
        square: sourceSquare,
        verbose: true // Get verbose objects to easily access 'to' square
    });

    // Highlight each target square for legal moves
    for (let i = 0; i < legalMoves.length; i++) {
        $(`[data-square='${legalMoves[i].to}']`).addClass('highlight-move');
    }
}

function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected highlight-move');
}

function deselectPiece() {
    tapSquare = null;
    removeHighlights();
}

// Initialize the game board
function initializeBoard(orientation) {
    console.log("Initializing board...");
    if (board) {
        board.destroy(); // Destroy existing board instance to reset it
    }

    const config = {
        draggable: false, // DRAG AND DROP DISABLED
        position: 'start',
        orientation: orientation, // Use the passed orientation
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        showNotation: true
    };

    board = Chessboard('board', config);
    $(window).resize(() => {
        board.resize();
        bindSquareClickHandlers(); // Re-bind on resize
    });
    updateStatus();

    // Initial binding of click handlers after board setup
    setTimeout(bindSquareClickHandlers, 500);
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

    // Initialize the board with the correct orientation
    initializeBoard(playerColor);

    // Set turn based on initial game state and player color
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
    deselectPiece(); // Ensure any selected piece is deselected after opponent's move
}

// Handle game over
function handleGameOver(data) {
    showStatus(data.result, 'info');
    disableGameControls();
    deselectPiece(); // Deselect on game end
}

// Handle player disconnection
function handlePlayerDisconnect(data) {
    showError(`${data.color} player has disconnected`);
    disableGameControls();
    deselectPiece(); // Deselect on disconnection
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
        status = (isMyTurn ? 'Your turn' : "Opponent's turn");
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

// Handle Draw Offer (client-side confirmation)
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

// Handle Draw Response
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

// Chat functionality
function addChatMessage(message, sender) {
    const $chatBox = $('#chatBox');
    const $message = $('<div>').addClass('chat-message');
    $message.html(`<strong>${sender}:</strong> ${message}`);
    $chatBox.append($message);
    $chatBox.scrollTop($chatBox[0].scrollHeight); // Scroll to bottom
}

// Enable game controls
function enableGameControls() {
    $('#resignBtn, #offerDrawBtn').prop('disabled', false);
    $('#chatInput, #sendChat').prop('disabled', false); // Enable chat
}

// Disable game controls
function disableGameControls() {
    $('#resignBtn, #offerDrawBtn').prop('disabled', true);
    $('#chatInput, #sendChat').prop('disabled', true); // Disable chat
}

// Event listeners
$(document).ready(() => {
    // Initial chessboard setup when the page loads, using a default 'white' orientation.
    // This ensures 'board' is initialized and ready for first interactions.
    // Buttons start disabled and get enabled on WebSocket connection.
    initializeBoard('white');
    $('#createRoom, #joinRoom').prop('disabled', true); // Start disabled

    // Connect to server when page loads (this will enable buttons on open)
    connectToServer();

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
            if (confirm("Are you sure you want to resign?")) {
                ws.send(JSON.stringify({
                    type: 'game_over',
                    roomId: currentRoom,
                    result: 'resign',
                    winner: playerColor === 'white' ? 'black' : 'white'
                }));
                handleGameOver({ result: `${playerColor} resigned. ${playerColor === 'white' ? 'Black' : 'White'} wins!` });
            }
        }
    });

    // Draw button click handler
    $('#offerDrawBtn').click(() => {
        if (currentRoom && isConnected) {
            if (confirm("Are you sure you want to offer a draw?")) {
                ws.send(JSON.stringify({
                    type: 'offer_draw',
                    roomId: currentRoom,
                    fromColor: playerColor // Send who is offering the draw
                }));
                showStatus('Draw offered to opponent', 'info');
            }
        }
    });

    // Chat send button click handler
    $('#sendChat').click(() => {
        const chatInput = $('#chatInput');
        const message = chatInput.val().trim();
        if (message && isConnected && currentRoom) {
            ws.send(JSON.stringify({
                type: 'chat_message',
                roomId: currentRoom,
                message: message,
                sender: playerColor // Or player's username if you add one
            }));
            addChatMessage(message, 'You'); // Display your own message instantly
            chatInput.val(''); // Clear input
        }
    });

    // Chat input enter key handler
    $('#chatInput').keypress(function(e) {
        if (e.which == 13) { // Enter key pressed
            $('#sendChat').click(); // Trigger send button click
        }
    });

    // Initial state for chat input and send button
    $('#chatInput, #sendChat').prop('disabled', true);
});
