let board = null;
let game = new Chess();
let stockfish = null;
let userColor = 'w';
let isComputerThinking = false;
let currentSkillLevel = 10; // Default skill level

// Initialize Stockfish
function initStockfish() {
    try {
        stockfish = new Worker('js/stockfish.js');

        stockfish.onmessage = function(event) {
            console.log("Stockfish says:", event.data);

            if (typeof event.data === 'string' && event.data.includes('bestmove')) {
                const tokens = event.data.split(' ');
                const move = tokens[1];
                if (move && move !== '(none)') {
                    makeComputerMove(move);
                }
            }
        };

        stockfish.onerror = (err) => {
            console.error("Stockfish error:", err);
        };

        stockfish.postMessage('uci');
        stockfish.postMessage(`setoption name Skill Level value ${currentSkillLevel}`);
        stockfish.postMessage('isready');

        console.log('Stockfish initialized');
    } catch (err) {
        console.error('Error initializing Stockfish:', err);
    }
}

// Set computer difficulty
function setDifficulty(level) {
    currentSkillLevel = level;
    if (stockfish) {
        stockfish.postMessage(`setoption name Skill Level value ${level}`);
        stockfish.postMessage('isready');
    }
}

// Initialize board
function initializeBoard() {
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
}

// On document ready
$(document).ready(function() {
    initializeBoard();
    initStockfish();
    initNavbarBehavior();

    $('#startBtn').on('click', newGame);
    $('#undoBtn').on('click', undoMove);
    $('#resignBtn').on('click', resignGame);

    $('input[name="playAs"]').on('change', function() {
        userColor = $('#playAsWhite').is(':checked') ? 'w' : 'b';
        newGame();
    });

    $('#difficulty').on('change', function() {
        const level = parseInt($(this).val());
        setDifficulty(level);

        const difficulty = level <= 5 ? 'Easy' :
                           level <= 10 ? 'Medium' :
                           level <= 15 ? 'Hard' : 'Expert';

        $('#gameStatus')
            .removeClass()
            .addClass('alert alert-info')
            .text(`Difficulty set to ${difficulty} (Level ${level})`);
    });

    updateStatus();
});

// Navbar scroll hide/show
function initNavbarBehavior() {
    let lastScrollTop = 0;
    const navbar = $('.navbar');

    $(window).scroll(function() {
        const scrollTop = $(this).scrollTop();

        if (scrollTop <= 0 || scrollTop < lastScrollTop) {
            navbar.removeClass('navbar-hidden');
        } else {
            navbar.addClass('navbar-hidden');
        }

        lastScrollTop = scrollTop;
    });
}

// Chess events
function onDragStart(source, piece) {
    return !game.game_over() &&
           !isComputerThinking &&
           game.turn() === userColor &&
           ((userColor === 'w' && piece.startsWith('w')) || 
            (userColor === 'b' && piece.startsWith('b')));
}

function onDrop(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (!move) return 'snapback';

    playMoveSound(move);
    board.position(game.fen());
    updateStatus();
    addMoveToHistory(move);

    if (!game.game_over()) {
        setTimeout(makeComputerThink, 250);
    }
}

function onSnapEnd() {
    board.position(game.fen());
}

function makeComputerThink() {
    if (!stockfish || isComputerThinking) return;

    isComputerThinking = true;
    updateStatus();

    try {
        stockfish.postMessage('position fen ' + game.fen());
        stockfish.postMessage('go movetime 1000');
    } catch (err) {
        console.error('Error during computer move:', err);
        isComputerThinking = false;
        updateStatus();
    }
}

function makeComputerMove(moveStr) {
    if (!moveStr || moveStr.length < 4) return;

    try {
        const move = game.move({
            from: moveStr.slice(0, 2),
            to: moveStr.slice(2, 4),
            promotion: moveStr.length > 4 ? moveStr[4] : 'q'
        });

        if (move) {
            board.position(game.fen());
            playMoveSound(move);
            addMoveToHistory(move);
            console.log('Computer moved:', move.san);
        }
    } catch (err) {
        console.error('Invalid computer move:', err);
    }

    isComputerThinking = false;
    updateStatus();
}

// Sounds
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

// Move history
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

// Status updater
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
        if (game.in_stalemate()) status += ' (Stalemate)';
        else if (game.in_threefold_repetition()) status += ' (Threefold Repetition)';
        else if (game.insufficient_material()) status += ' (Insufficient Material)';
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

// Game end sound
function playGameEndSound(isCheckmate) {
    const audio = new Audio(
        isCheckmate
            ? 'https://lichess1.org/assets/sound/standard/Victory.ogg'
            : 'https://lichess1.org/assets/sound/standard/Draw.ogg'
    );
    audio.play().catch(() => {});
}

// Game control
function newGame() {
    game.reset();
    board.start();
    $('#moveHistory').empty();

    if (userColor === 'b') {
        setTimeout(makeComputerThink, 500);
    }

    updateStatus();
}

function undoMove() {
    if (isComputerThinking) return;

    game.undo(); // player's move
    game.undo(); // computer's move
    board.position(game.fen());

    $('#moveHistory div:first').remove();
    $('#moveHistory div:first').remove();

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
}
