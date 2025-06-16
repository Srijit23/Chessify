let board = null;
let game = new Chess();
let stockfish = null;
let userColor = 'w';
let isComputerThinking = false;
let currentSkillLevel = 10;
let selectedSquare = null;

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

function setDifficulty(level) {
    currentSkillLevel = level;
    if (stockfish) {
        stockfish.postMessage(`setoption name Skill Level value ${level}`);
    }
}

function initializeBoard() {
    board = Chessboard('board', {
        draggable: true,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart,
        onDrop,
        onSnapEnd,
        showNotation: true
    });

    $(window).resize(() => board.resize());

    // Tap-to-move handler
    $('#board').on('click', 'div[class^="square-"]', function () {
        if (game.game_over() || isComputerThinking) return;

        const square = $(this).attr('data-square');
        const piece = game.get(square);

        // 1st tap - selecting
        if (!selectedSquare) {
            if (!piece || piece.color !== userColor || game.turn() !== userColor) return;
            selectedSquare = square;
            highlightSelectionAndMoves(square);
        }
        // 2nd tap - attempting to move
        else {
            if (square === selectedSquare) {
                selectedSquare = null;
                removeHighlights();
                return;
            }

            const move = game.move({
                from: selectedSquare,
                to: square,
                promotion: 'q'
            });

            selectedSquare = null;
            removeHighlights();

            if (move === null) return;

            board.position(game.fen());
            playMoveSound(move);
            addMoveToHistory(move);
            updateStatus();

            if (!game.game_over()) setTimeout(makeComputerThink, 300);
        }
    });
}

function highlightSelectionAndMoves(square) {
    removeHighlights();
    $(`[data-square='${square}']`).css('background-color', '#b9eaff');
    const moves = game.moves({ square, verbose: true });
    moves.forEach(m => {
        $(`[data-square='${m.to}']`).css('background-color', '#d6f5d6');
    });
}

function removeHighlights() {
    $('div[class^="square-"]').css('background-color', '');
}

function onDragStart(source, piece) {
    if (game.game_over() || isComputerThinking || game.turn() !== userColor) return false;
    if ((userColor === 'w' && piece.startsWith('b')) || (userColor === 'b' && piece.startsWith('w'))) return false;
    return true;
}

function onDrop(source, target) {
    removeHighlights();

    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) return 'snapback';

    board.position(game.fen());
    playMoveSound(move);
    addMoveToHistory(move);
    updateStatus();

    if (!game.game_over()) setTimeout(makeComputerThink, 300);
}

function onSnapEnd() {
    board.position(game.fen());
}

function makeComputerThink() {
    if (!stockfish || isComputerThinking) return;
    isComputerThinking = true;
    updateStatus();

    const fen = game.fen();
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go movetime 1000');
}

function makeComputerMove(moveStr) {
    const move = game.move({
        from: moveStr.slice(0, 2),
        to: moveStr.slice(2, 4),
        promotion: moveStr.length > 4 ? moveStr[4] : 'q'
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
    audio.play().catch(() => {});
}

function addMoveToHistory(move) {
    const moveText = `${game.history().length % 2 === 0 ? (game.history().length / 2) + '.' : ''} ${move.san}`;
    const div = $('<div>').text(moveText).addClass('move-item');
    $('#moveHistory div').removeClass('latest-move');
    div.addClass('latest-move');
    $('#moveHistory').prepend(div);
}

function updateStatus() {
    let status = '';

    if (isComputerThinking) {
        status = 'Computer is thinking...';
        $('#gameStatus').removeClass().addClass('alert alert-warning');
    } else if (game.in_checkmate()) {
        status = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!`;
        $('#gameStatus').removeClass().addClass('alert alert-success');
    } else if (game.in_draw()) {
        status = 'Game Drawn.';
        $('#gameStatus').removeClass().addClass('alert alert-info');
    } else {
        const turn = game.turn() === 'w' ? 'White' : 'Black';
        status = `${turn}'s turn${game.in_check() ? ' (in check!)' : ''}`;
        $('#gameStatus').removeClass().addClass('alert alert-info');
    }

    $('#gameStatus').text(status);
}

function newGame() {
    game.reset();
    board.start();
    $('#moveHistory').empty();
    selectedSquare = null;
    if (userColor === 'b') setTimeout(makeComputerThink, 500);
    updateStatus();
}

function undoMove() {
    if (isComputerThinking) return;
    game.undo();
    game.undo();
    board.position(game.fen());
    $('#moveHistory div:first').remove();
    $('#moveHistory div:first').remove();
    selectedSquare = null;
    updateStatus();
}

function resignGame() {
    if (isComputerThinking) return;
    game.reset();
    board.start();
    $('#moveHistory').empty();
    $('#gameStatus')
        .removeClass()
        .addClass('alert alert-info')
        .text('Game resigned. Start a new game!');
    selectedSquare = null;
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
    });

    $('#difficulty').on('change', function () {
        const level = parseInt($(this).val());
        setDifficulty(level);
        const difficulty = level <= 5 ? 'Easy' : level <= 10 ? 'Medium' : level <= 15 ? 'Hard' : 'Expert';
        $('#gameStatus')
            .removeClass()
            .addClass('alert alert-info')
            .text(`Difficulty set to ${difficulty} (Level ${level})`);
    });

    updateStatus();
});
