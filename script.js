let board = null;
let game = new Chess();
let stockfish = null;
let userColor = 'w';
let isComputerThinking = false;
let currentSkillLevel = 10;
let tapSquare = null;

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

    setTimeout(() => {
        $('#board .square-55d63').on('click', function () {
            const square = $(this).attr('data-square');
            console.log("Clicked square:", square);

            if (isComputerThinking || game.game_over()) return;

            if (!tapSquare) {
                const piece = game.get(square);
                if (!piece || piece.color !== userColor) return;
                tapSquare = square;
                highlightSquare(square);
            } else {
                if (square === tapSquare) {
                    tapSquare = null;
                    removeHighlight();
                    return;
                }

                const move = game.move({
                    from: tapSquare,
                    to: square,
                    promotion: 'q'
                });

                tapSquare = null;
                removeHighlight();

                if (move === null) return;

                board.position(game.fen());
                playMoveSound(move);
                addMoveToHistory(move);
                updateStatus();

                if (!game.game_over()) setTimeout(makeComputerThink, 250);
            }
        });
    }, 500); // delay ensures board is ready
}

function highlightSquare(square) {
    removeHighlight();
    $(`[data-square='${square}']`).css('background-color', '#b9eaff');
}

function removeHighlight() {
    $('.square-55d63').css('background-color', '');
}

function onDragStart(source, piece) {
    if (game.game_over() || isComputerThinking || game.turn() !== userColor ||
        (game.turn() === 'w' && piece.startsWith('b')) ||
        (game.turn() === 'b' && piece.startsWith('w'))) {
        return false;
    }
    return true;
}

function onDrop(source, target) {
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

    if (!game.game_over()) setTimeout(makeComputerThink, 250);
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
    if (!moveStr || moveStr.length < 4) {
        isComputerThinking = false;
        updateStatus();
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
    const moveNumber = Math.floor((game.history().length + 1) / 2);
    const moveText = `${moveNumber}. ${move.san}`;

    const moveDiv = $('<div>')
        .text(moveText)
        .addClass('move-item');

    $('#moveHistory div').removeClass('latest-move');
    moveDiv.addClass('latest-move');
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
    tapSquare = null;
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
    tapSquare = null;
    updateStatus();
}

function resignGame() {
    if (isComputerThinking) return;

    game.reset();
    board.start();
    $('#moveHistory').empty();
    tapSquare = null;
    $('#gameStatus')
        .removeClass()
        .addClass('alert alert-info')
        .text('Game resigned. Start a new game!');
}

// Init everything
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
        currentSkillLevel = level;
        stockfish.postMessage(`setoption name Skill Level value ${level}`);
        $('#gameStatus')
            .removeClass()
            .addClass('alert alert-info')
            .text(`Difficulty set to Level ${level}`);
    });

    updateStatus();
});
