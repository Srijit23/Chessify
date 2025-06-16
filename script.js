let board = null;
let game = new Chess();
let stockfish = null;
let userColor = 'w';
let isComputerThinking = false;
let currentSkillLevel = 10;
let tapSquare = null; // This will store the square of the currently selected piece

// New: Flag to ensure Stockfish is ready before sending commands
let stockfishIsReady = false;

function initStockfish() {
    stockfish = new Worker('js/stockfish.js');

    stockfish.onmessage = function (event) {
        if (typeof event.data === 'string') {
            console.log("Stockfish Output:", event.data); // Log all Stockfish output for debugging

            if (event.data === 'readyok') {
                stockfishIsReady = true;
                console.log("Stockfish is ready!");
                // Set skill level ONLY when ready
                stockfish.postMessage(`setoption name Skill Level value ${currentSkillLevel}`);
            } else if (event.data.includes('bestmove')) {
                const tokens = event.data.split(' ');
                const move = tokens[1];
                if (move && move !== '(none)') {
                    makeComputerMove(move);
                } else {
                    console.error("Stockfish returned 'none' or invalid bestmove:", event.data);
                    isComputerThinking = false; // Release thinking state if no valid move
                    updateStatus();
                }
            }
        }
    };

    stockfish.postMessage('uci');
    stockfish.postMessage('isready'); // Request readiness
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

    $(window).resize(() => board.resize());

    setTimeout(() => {
        $('#board .square-55d63').on('click', function () {
            const clickedSquare = $(this).attr('data-square');
            console.log("Clicked square:", clickedSquare);

            if (isComputerThinking || game.game_over()) {
                console.log("Interaction blocked: computer thinking or game over.");
                return;
            }

            if (tapSquare === null) {
                const piece = game.get(clickedSquare);
                if (piece && piece.color === userColor && game.turn() === userColor) {
                    tapSquare = clickedSquare;
                    highlightLegalMoves(tapSquare);
                    console.log("Piece selected:", tapSquare);
                } else {
                    console.log("Cannot select: no piece, not your piece, or not your turn.");
                    removeHighlights();
                }
            } else {
                if (clickedSquare === tapSquare) {
                    deselectPiece();
                    console.log("Piece deselected.");
                } else {
                    const moveAttempt = {
                        from: tapSquare,
                        to: clickedSquare,
                        promotion: 'q'
                    };

                    const moveResult = game.move(moveAttempt);

                    if (moveResult === null) {
                        const newPiece = game.get(clickedSquare);
                        if (newPiece && newPiece.color === userColor && game.turn() === userColor) {
                            deselectPiece();
                            tapSquare = clickedSquare;
                            highlightLegalMoves(tapSquare);
                            console.log("Invalid move, selecting new piece:", clickedSquare);
                        } else {
                            deselectPiece();
                            console.log("Invalid move, deselecting piece.");
                        }
                    } else {
                        board.position(game.fen());
                        playMoveSound(moveResult);
                        addMoveToHistory(moveResult);
                        updateStatus();
                        deselectPiece();
                        console.log("Move made:", moveResult);

                        if (!game.game_over()) setTimeout(makeComputerThink, 250);
                    }
                }
            }
        });
    }, 500);
}

function highlightLegalMoves(sourceSquare) {
    removeHighlights();
    $(`[data-square='${sourceSquare}']`).addClass('highlight-selected');
    const legalMoves = game.moves({
        square: sourceSquare,
        verbose: true
    });
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

function makeComputerThink() {
    if (!stockfish || isComputerThinking) {
        console.log("Computer already thinking or Stockfish not initialized.");
        return;
    }

    if (!stockfishIsReady) { // Ensure Stockfish is ready before sending commands
        console.warn("Stockfish not yet ready. Waiting...");
        setTimeout(makeComputerThink, 100); // Try again shortly
        return;
    }

    isComputerThinking = true;
    updateStatus();
    console.log("Computer is starting to think...");

    const fen = game.fen();
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go movetime 1000');
}

function makeComputerMove(moveStr) {
    if (!moveStr || moveStr.length < 4) {
        isComputerThinking = false;
        updateStatus();
        console.log("Invalid move string received from Stockfish (too short).");
        return;
    }

    const move = game.move({
        from: moveStr.slice(0, 2),
        to: moveStr.slice(2, 4),
        promotion: moveStr.length > 4 ? moveStr[4] : 'q'
    });

    if (move) {
        board.position(game.fen());
        playMoveSound(move);
        addMoveToHistory(move);
        console.log("Computer made move:", moveStr);
    } else {
        console.error("Stockfish suggested an illegal move, or a promotion character was missing/invalid:", moveStr, game.fen());
        // Crucial: Handle this error gracefully. If Stockfish gives an illegal move,
        // it means its internal state is off or the FEN sent was incorrect.
        // For now, we'll just log and let the game continue in a potentially broken state.
        // A more robust solution might involve:
        // - Resetting Stockfish
        // - Re-syncing Stockfish's FEN
        // - Alerting the user to a critical error
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
    audio.play().catch(() => { /* console.error("Audio playback failed:", error); */ });
}

function addMoveToHistory(move) {
    const moveNumber = Math.floor((game.history().length + 1) / 2);
    const moveText = `${moveNumber}. ${move.san}`;

    const moveDiv = $('<div>')
        .text(moveText)
        .addClass('move-item');

    $('#moveHistory div').removeClass('latest-move');
    $('#moveHistory').prepend(moveDiv);
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
    board.start();
    $('#moveHistory').empty();
    deselectPiece();
    if (userColor === 'b') setTimeout(makeComputerThink, 500);
    updateStatus();
    console.log("New game started.");
}

function undoMove() {
    if (isComputerThinking) {
        console.log("Cannot undo: Computer is thinking.");
        return;
    }

    // Try to undo two moves (player's and computer's)
    const lastPlayerMove = game.undo();
    let lastComputerMove = null;
    if (lastPlayerMove) { // Only undo computer move if player move existed
        lastComputerMove = game.undo();
    }

    if (lastPlayerMove || lastComputerMove) {
        board.position(game.fen());
        $('#moveHistory div:first').remove(); // Remove player's move
        if (lastComputerMove) {
            $('#moveHistory div:first').remove(); // Remove computer's move
        }
        deselectPiece();
        updateStatus();
        console.log("Last moves undone.");
    } else {
        console.log("No moves to undo.");
    }
}

function resignGame() {
    if (isComputerThinking) return;

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

$(document).ready(function () {
    initializeBoard();
    initStockfish();

    $('#startBtn').on('click', newGame);
    $('#undoBtn').on('click', undoMove);
    $('#resignBtn').on('click', resignGame);

    $('input[name="playAs"]').on('change', function () {
        userColor = $('#playAsWhite').is(':checked') ? 'w' : 'b';
        newGame();
        console.log("User color set to:", userColor);
    });

    $('#difficulty').on('change', function () {
        const level = parseInt($(this).val());
        currentSkillLevel = level;
        if (stockfishIsReady) { // Only send option if Stockfish is ready
            stockfish.postMessage(`setoption name Skill Level value ${level}`);
        } else {
            console.warn("Stockfish not ready, skill level will be set when it is.");
        }
        $('#gameStatus')
            .removeClass()
            .addClass('alert alert-info')
            .text(`Difficulty set to Level ${level}`);
        console.log("Difficulty set to Level:", level);
    });

    updateStatus();
    console.log("Document ready. Initializing game.");
});
