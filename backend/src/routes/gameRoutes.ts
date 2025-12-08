import { Router, Application, Request, Response, NextFunction } from 'express';
import { GameController } from '../controllers/gameController';
import pool from '../database/db'; // Import the shared pool
import { io as socketIoInstance } from '../socketSetup'; // Import from new file
import rateLimit from 'express-rate-limit'; // Import rateLimit

const router = Router();

// Strict Limiter for Game Creation (AI Cost Control)
const createGameLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many games created from this IP. Please wait a while.'
});

// Middleware to check if a room exists
async function checkRoomExists(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check URL parameters first, then query parameters
    const roomCode = req.params.roomCode || req.query.roomCode;
    const source = req.params.roomCode ? 'params' : (req.query.roomCode ? 'query' : 'none');
    console.log(`checkRoomExists: Checking roomCode '${roomCode}' from ${source} for route ${req.method} ${req.originalUrl}`); // Added logging

    if (!roomCode) {
        console.log(`checkRoomExists: No roomCode found for route ${req.method} ${req.originalUrl}`);
        res.status(400).json({ error: 'Room code is required in URL path or query string' }); // Updated error message
        return;
    }

    try {
        const query = 'SELECT game_id FROM games WHERE room_code = $1';
        const result = await pool.query(query, [roomCode as string]);

        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        next();
    } catch (error) {
        console.error('Error checking room existence:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export function setRoutes(app: Application) {
    // Add debug log to confirm io instance is passed to GameController
    console.log('Passing io instance from socketSetup to GameController:', socketIoInstance ? 'OK' : 'Failed or not yet assigned');

    // Instantiate the controller here, ensuring io is available
    const gameController = new GameController(pool, socketIoInstance); // Use imported io

    app.use('/api/games', router);

    // Bind the controller methods to the instance
    router.post('/create', createGameLimiter, gameController.createGame.bind(gameController));
    router.post('/join', gameController.joinGame.bind(gameController));
    router.post('/:roomCode/start', checkRoomExists, gameController.startGame.bind(gameController));
    router.post('/:roomCode/answer', checkRoomExists, gameController.handleAnswer.bind(gameController));
    router.post('/:roomCode/submit-answer', checkRoomExists, gameController.submitAnswer.bind(gameController));
    router.post('/:roomCode/joker', checkRoomExists, gameController.useJoker.bind(gameController));
    router.get('/questions', gameController.getQuestions.bind(gameController));
    router.get('/categories', gameController.getCategories.bind(gameController));
    router.get('/list-active', gameController.getActiveGames.bind(gameController));
    router.get('/:id', gameController.getGameById.bind(gameController)); // Uses game ID
    router.get('/:roomCode/current-question', checkRoomExists, gameController.getCurrentQuestion.bind(gameController));
    router.get('/:id/state', gameController.getGameState.bind(gameController)); // Uses game ID
    router.get('/:roomCode/players', gameController.getPlayers.bind(gameController));
}