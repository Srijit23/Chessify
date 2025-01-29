# SrijitChess - Online Multiplayer Chess Game

A real-time multiplayer chess game built with HTML, CSS, JavaScript, and WebSocket technology.

## Features

- Play chess against other players in real-time
- Create and join game rooms
- Spectator mode
- Move validation and game state tracking
- Real-time chat (coming soon)
- Responsive design
- Practice mode against computer

## Tech Stack

- Frontend:
  - HTML5
  - CSS3
  - JavaScript
  - Chess.js (chess logic)
  - Chessboard.js (chess UI)
  - Bootstrap 5 (styling)

- Backend:
  - Node.js
  - WebSocket (ws)
  - Vercel Serverless Functions

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm start
```

3. Open http://localhost:3000 in your browser

## Deployment to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy to Vercel:
```bash
vercel
```

4. For production deployment:
```bash
vercel --prod
```

## Project Structure

```
chessify/
├── api/
│   └── socket.js      # WebSocket server (Vercel serverless function)
├── img/               # Image assets
├── index.html         # Main page
├── play.html         # Multiplayer game page
├── style.css         # Styles
├── script.js         # Practice mode logic
├── multiplayer.js    # Multiplayer game logic
├── package.json      # Dependencies
└── vercel.json       # Vercel configuration
```

## Environment Variables

No environment variables are required for basic functionality.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License
