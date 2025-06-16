let board = null;
let game = new Chess();
let stockfish = null;
let userColor = 'w';
let isComputerThinking = false;
let currentSkillLevel = 10;
let tapSquare = null; // This will store the square of the currently selected piece

function initStockfish() {
    stockfish = new Worker('js/stockfish.js');

    stockfish.onmessage = function (event) {
        if (typeof event.data === 'string' && event.data.includes('bestmove')) {
            const tokens = event.data.split(' ');
            const move = tokens[1];
            if (move && move !== '(none)') makeComputerMove(move);
        }
    };

    stockfish.postMessage('uci');
    stockfish.postMessage(`setoption name Skill Level value ${currentSkillLevel}`);
    stockfish.postMessage('isready');
}

function initializeBoard() {
    console.log("Initializing board...");

    const config = {
        draggable: false, // <--- IMPORTANT CHANGE: DRAG AND DROP DISABLED
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        // onDragStart, onDrop, onSnapEnd are removed as draggable is false
        showNotation: true
    };

    board = Chessboard('board', config);

    $(window).resize(() => board.resize());

    // Delay to ensure the board DOM elements are fully rendered before attaching click listeners
    setTimeout(() => {
        $('#board .square-55d63').on('click', function () {
            const clickedSquare = $(this).attr('data-square');
            console.log("Clicked square:", clickedSquare);

            // Prevent interaction if computer is thinking or game is over
            if (isComputerThinking || game.game_over()) {
                console.log("Interaction blocked: computer thinking or game over.");
                return;
            }

            // Scenario 1: No piece is currently selected for tap-to-move
            if (tapSquare === null) {
                const piece = game.get(clickedSquare);
                // Only allow selecting a piece if it's the user's turn and their color
                if (piece && piece.color === userColor && game.turn() === userColor) {
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
                        if (newPiece && newPiece.color === userColor && game.turn() === userColor) {
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
                        // Valid move. Execute it.
                        board.position(game.fen()); // Update the visual board
                        playMoveSound(moveResult);
                        addMoveToHistory(moveResult);
                        updateStatus();
                        deselectPiece(); // Deselect after a successful move
                        console.log("Move made:", moveResult);

                        // If the game isn't over, let the computer think
                        if (!game.game_over()) setTimeout(makeComputerThink, 250);
                    }
                }
            }
        });
    }, 500); // delay ensures board is ready
}

/**
 * Highlights the selected piece and all its legal target squares.
 * @param {string} sourceSquare - The algebraic notation of the square with the selected piece.
 */
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

/**
 * Removes all highlight classes from all squares on the board.
 */
function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected highlight-move');
}

/**
 * Deselects the current piece and removes all highlights.
 */
function deselectPiece() {
    tapSquare = null;
    removeHighlights();
}

// Removed onDragStart, onDrop, onSnapEnd functions completely
// since draggable is set to false in the config.

function makeComputerThink() {
    if (!stockfish || isComputerThinking) {
        console.log("Computer already thinking or Stockfish not initialized.");
        return;
    }

    isComputerThinking = true;
    updateStatus();
    console.log("Computer is starting to think...");

    const fen = game.fen();
    stockfish.postMessage('position fen ' + fen);
    // Give Stockfish 1 second to think (adjust movetime as needed for difficulty)
    stockfish.postMessage('go movetime 1000');
}

function makeComputerMove(moveStr) {
    if (!moveStr || moveStr.length < 4) {
        isComputerThinking = false;
        updateStatus();
        console.log("Invalid move string received from Stockfish.");
        return;
    }

    const move = game.move({
        from: moveStr.slice(0, 2),
        to: moveStr.slice(2, 4),
        promotion: moveStr.length > 4 ? moveStr[4] : 'q' // Handle promotion if included
    });

    if (move) {
        board.position(game.fen());
        playMoveSound(move);
        addMoveToHistory(move);
        console.log("Computer made move:", moveStr);
    } else {
        console.error("Stockfish suggested an illegal move:", moveStr);
    }

    isComputerThinking = false;
    updateStatus();
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
    audio.play().catch(() => { /* console.error("Audio playback failed:", error); */ }); // Catch and ignore play errors
}

function addMoveToHistory(move) {
    const moveNumber = Math.floor((game.history().length + 1) / 2); // Calculate move number
    const moveText = `${moveNumber}. ${move.san}`; // e.g., "1. e4"

    const moveDiv = $('<div>')
        .text(moveText)
        .addClass('move-item');

    // Remove 'latest-move' from previous and add to the new one
    $('#moveHistory div').removeClass('latest-move');
    $('#moveHistory').prepend(moveDiv); // Add the new move to the top
}

function updateStatus() {
    let status = '';

    if (isComputerThinking) {
        status = 'Computer is thinking...';
        $('#gameStatus').removeClass().addClass('alert alert-warning');
    } else if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'Black' : 'White';
        status = `Checkmate! ${winner} wins!`;
        $('#gameStatus').removeClass().addClass('alert alert-success');
        playGameEndSound(true);
    } else if (game.in_draw()) {
        status = 'Game Over - Draw';
        $('#gameStatus').removeClass().addClass('alert alert-info');
        playGameEndSound(false);
    } else {
        const turn = game.turn() === 'w' ? 'White' : 'Black';
        status = `${turn} to move`;
        if (game.in_check()) {
            status += ` (${turn} is in check!)`;
            $('#gameStatus').removeClass().addClass('alert alert-warning');
        } else {
            $('#gameStatus').removeClass().addClass('alert alert-info');
        }
    }

    $('#gameStatus').text(status);
}

function playGameEndSound(isCheckmate) {
    const audio = new Audio();
    audio.src = isCheckmate
        ? 'https://lichess1.org/assets/sound/standard/Victory.ogg'
        : 'https://lichess1.org/assets/sound/standard/Draw.ogg';
    audio.play().catch(() => {});
}

function newGame() {
    game.reset();
    board.start(); // Resets the chessboard.js board visually
    $('#moveHistory').empty(); // Clear move history
    deselectPiece(); // Ensure no piece is selected
    if (userColor === 'b') setTimeout(makeComputerThink, 500); // If playing as black, computer moves first
    updateStatus(); // Update game status
    console.log("New game started.");
}

function undoMove() {
    if (isComputerThinking) {
        console.log("Cannot undo: Computer is thinking.");
        return; // Prevent undo while computer is thinking
    }

    const lastMove = game.undo(); // Undo player's move
    const prevMove = game.undo(); // Undo computer's move

    if (lastMove || prevMove) { // Only update if moves were actually undone
        board.position(game.fen()); // Update board to reflect undone moves
        $('#moveHistory div:first').remove(); // Remove player's move from history
        if (prevMove) { // If computer also made a move, remove its history entry
            $('#moveHistory div:first').remove();
        }
        deselectPiece(); // Deselect any piece
        updateStatus(); // Update game status
        console.log("Last moves undone.");
    } else {
        console.log("No moves to undo.");
    }
}

function resignGame() {
    if (isComputerThinking) return;

    // Reset game state and board display
    game.reset();
    board.start();
    $('#moveHistory').empty();
    deselectPiece();
    $('#gameStatus')
        .removeClass()
        .addClass('alert alert-info')
        .text('Game resigned. Start a new game!');
    console.log("Game resigned.");
}

// Init everything when the document is ready
$(document).ready(function () {
    initializeBoard();
    initStockfish();

    $('#startBtn').on('click', newGame);
    $('#undoBtn').on('click', undoMove);
    $('#resignBtn').on('click', resignGame);

    // Handle playing as White/Black selection
    $('input[name="playAs"]').on('change', function () {
        userColor = $('#playAsWhite').is(':checked') ? 'w' : 'b';
        newGame(); // Start a new game with the selected color
        console.log("User color set to:", userColor);
    });

    // Handle difficulty level change
    $('#difficulty').on('change', function () {
        const level = parseInt($(this).val());
        currentSkillLevel = level;
        stockfish.postMessage(`setoption name Skill Level value ${level}`);
        $('#gameStatus')
            .removeClass()
            .addClass('alert alert-info')
            .text(`Difficulty set to Level ${level}`);
        console.log("Difficulty set to Level:", level);
    });

    updateStatus(); // Initial status update
    console.log("Document ready. Initializing game.");
});
