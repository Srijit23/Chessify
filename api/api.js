const serverURL = "https://chessify1-server.onrender.com"; // Replace with your actual Render backend URL

export async function startGame() {
    try {
        const response = await fetch(`${serverURL}/game/start`);
        return await response.json();
    } catch (error) {
        console.error("Error starting game:", error);
    }
}

export async function getGameState(gameId) {
    try {
        const response = await fetch(`${serverURL}/game/state/${gameId}`);
        return await response.json();
    } catch (error) {
        console.error("Error getting game state:", error);
    }
}
