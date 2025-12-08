"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRoutes = setRoutes;
const express_1 = require("express");
const gameController_1 = require("../controllers/gameController");
const db_1 = __importDefault(require("../database/db")); // Import the shared pool
const socketSetup_1 = require("../socketSetup"); // Import from new file
const router = (0, express_1.Router)();
// Middleware to check if a room exists
function checkRoomExists(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
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
            const result = yield db_1.default.query(query, [roomCode]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Room not found' });
                return;
            }
            next();
        }
        catch (error) {
            console.error('Error checking room existence:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function setRoutes(app) {
    // Add debug log to confirm io instance is passed to GameController
    console.log('Passing io instance from socketSetup to GameController:', socketSetup_1.io ? 'OK' : 'Failed or not yet assigned');
    // Instantiate the controller here, ensuring io is available
    const gameController = new gameController_1.GameController(db_1.default, socketSetup_1.io); // Use imported io
    app.use('/api/games', router);
    // Bind the controller methods to the instance
    router.post('/create', gameController.createGame.bind(gameController));
    router.post('/join', gameController.joinGame.bind(gameController));
    router.post('/:roomCode/start', checkRoomExists, gameController.startGame.bind(gameController));
    router.post('/:roomCode/answer', checkRoomExists, gameController.handleAnswer.bind(gameController));
    router.post('/:roomCode/submit-answer', checkRoomExists, gameController.submitAnswer.bind(gameController));
    router.get('/questions', gameController.getQuestions.bind(gameController));
    router.get('/list-active', gameController.getActiveGames.bind(gameController));
    router.get('/:id', gameController.getGameById.bind(gameController)); // Uses game ID
    router.get('/:roomCode/current-question', checkRoomExists, gameController.getCurrentQuestion.bind(gameController));
    router.get('/:id/state', gameController.getGameState.bind(gameController)); // Uses game ID
    router.get('/:roomCode/players', gameController.getPlayers.bind(gameController));
}
