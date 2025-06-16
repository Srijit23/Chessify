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
        draggable: true,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        showNotation: true
    };

    board = Chessboard('board', config);

    $(window).resize(() => board.resize());

    // Delay to ensure the board DOM elements are fully rendered before attaching click listeners
    setTimeout(() => {
        $('#board .square-55d63').on('click', function () {
            const square = $(this).attr('data-square');
            console.log("Clicked square for tap-to-move:", square);

            // Prevent interaction if computer is thinking or game is over
            if (isComputerThinking || game.game_over()) {
                console.log("Interaction blocked: computer thinking or game over.");
                return;
            }

            // Scenario 1: No piece is currently selected for tap-to-move
            if (!tapSquare) {
                const piece = game.get(square);
                // Only allow selecting a piece if it's the player's turn and their color
                if (piece && piece.color === userColor[0] && game.turn() === userColor[0]) {
                    tapSquare = square;
                    highlightSquare(square);
                    console.log("Piece selected:", square);
                    // Optionally, highlight legal moves for the selected piece
                    highlightLegalMoves(square);
                } else {
                    console.log("Cannot select: no piece, not your piece, or not your turn.");
                }
            } else {
                // Scenario 2: A piece is already selected
                // Check if the user clicked the same square (to deselect)
                if (square === tapSquare) {
                    deselectPiece();
                    console.log("Piece deselected.");
                } else {
                    // Attempt to move the selected piece to the new square
                    const move = game.move({
                        from: tapSquare,
                        to: square,
                        promotion: 'q' // Default to queen promotion
                    });

                    if (move === null) {
                        // Invalid move. If the clicked square has a piece of the user's color,
                        // treat it as selecting a new piece. Otherwise, deselect.
                        const newPiece = game.get(square);
                        if (newPiece && newPiece.color === userColor[0] && game.turn() === userColor[0]) {
                            deselectPiece(); // Deselect old piece
                            tapSquare = square; // Select new piece
                            highlightSquare(square);
                            highlightLegalMoves(square);
                            console.log("Invalid move, selecting new piece:", square);
                        } else {
                            deselectPiece();
                            console.log("Invalid move, deselecting piece.");
                        }
                    } else {
                        // Valid move. Execute it.
                        board.position(game.fen());
                        playMoveSound(move);
                        addMoveToHistory(move);
                        updateStatus();
                        deselectPiece(); // Deselect after a successful move
                        console.log("Move made:", move);

                        // If the game isn't over, let the computer think
                        if (!game.game_over()) setTimeout(makeComputerThink, 250);
                    }
                }
            }
        });
    }, 500); // delay ensures board is ready
}

function highlightSquare(square) {
    removeHighlights(); // Remove all highlights first
    $(`[data-square='${square}']`).addClass('highlight-selected');
}

function highlightLegalMoves(sourceSquare) {
    removeHighlights(); // Remove all highlights first
    $(`[data-square='${sourceSquare}']`).addClass('highlight-selected'); // Highlight the selected piece

    const moves = game.moves({
        square: sourceSquare,
        verbose: true
    });

    for (let i = 0; i < moves.length; i++) {
        $(`[data-square='${moves[i].to}']`).addClass('highlight-move');
    }
}

function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected highlight-move');
}

function deselectPiece() {
    tapSquare = null;
    removeHighlights();
}

function onDragStart(source, piece) {
    // If a piece is selected via tap, prevent drag for other pieces
    if (tapSquare && tapSquare !== source) {
        return false;
    }

    // Standard drag start conditions
    if (game.game_over() || isComputerThinking || game.turn() !== userColor[0] ||
        (game.turn() === 'w' && piece.startsWith('b')) ||
        (game.turn() === 'b' && piece.startsWith('w'))) {
        return false;
    }

    // Remove any tap-to-move highlights when drag starts
    deselectPiece();
    return true;
}

function onDrop(source, target) {
    // Attempt to make the move
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    // If the move is illegal, snap the piece back
    if (move === null) return 'snapback';

    // If valid, update the board, play sound, add to history, and update status
    board.position(game.fen());
    playMoveSound(move);
    addMoveToHistory(move);
    updateStatus();

    // If the game isn't over, let the computer think
    if (!game.game_over()) setTimeout(makeComputerThink, 250);
}

function onSnapEnd() {
    // This is called after the piece has been dropped and the board's position is updated.
    // Ensure the board's visual state matches the game's internal FEN.
    board.position(game.fen());
}

function makeComputerThink() {
    if (!stockfish || isComputerThinking) return;

    isComputerThinking = true;
    updateStatus();

    const fen = game.fen();
    stockfish.postMessage('position fen ' + fen);
    // Give Stockfish 1 second to think (adjust movetime as needed for difficulty)
    stockfish.postMessage('go movetime 1000');
}

function makeComputerMove(moveStr) {
    if (!moveStr || moveStr.length < 4) {
        isComputerThinking = false;
        updateStatus();
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
    audio.play().catch(() => {}); // Catch and ignore play errors
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
}

function undoMove() {
    if (isComputerThinking) return; // Prevent undo while computer is thinking

    game.undo(); // Undo player's move
    game.undo(); // Undo computer's move
    board.position(game.fen()); // Update board to reflect undone moves
    $('#moveHistory div:first').remove(); // Remove player's move from history
    $('#moveHistory div:first').remove(); // Remove computer's move from history
    deselectPiece(); // Deselect any piece
    updateStatus(); // Update game status
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
    });

    updateStatus(); // Initial status update
});
