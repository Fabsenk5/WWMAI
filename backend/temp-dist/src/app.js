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
exports.server = void 0;
const express_1 = __importDefault(require("express"));
const body_parser_1 = require("body-parser");
const db_1 = require("./database/db"); // Import initializeDatabase function
const db_2 = __importDefault(require("./database/db")); // <--- ADD THIS LINE
const gameRoutes_1 = require("./routes/gameRoutes");
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socketSetup_1 = require("./socketSetup"); // Import from new file
const cleanupRooms_1 = require("./database/cleanupRooms"); // Import the cleanup function
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
// Middleware
app.use((0, body_parser_1.json)());
app.use((0, cors_1.default)());
// Database connection
(0, db_1.connectWithRetry)();
// Set up routes
// setRoutes(app); // Moved after io initialization
const server = (0, http_1.createServer)(app);
exports.server = server;
// Initialize Socket.IO using the HttpServer instance
(0, socketSetup_1.initializeSocket)(server); // This will initialize and export 'io' from socketSetup.ts
console.log('Socket.IO instance obtained from socketSetup in app.ts:', socketSetup_1.io ? 'OK' : 'Failed or not yet assigned');
// Initialize the database with the io instance from socketSetup
(0, db_1.initializeDatabase)(socketSetup_1.io); // Pass the imported io instance
// Set up routes - must be after io is initialized and passed to GameController
(0, gameRoutes_1.setRoutes)(app);
// Start periodic room cleanup
setInterval(() => {
    (0, cleanupRooms_1.cleanupInactiveRooms)().catch(err => {
        console.error("[App] Error during scheduled room cleanup:", err);
    });
}, ROOM_CLEANUP_INTERVAL_MS);
console.log(`[App] Scheduled inactive room cleanup to run every ${ROOM_CLEANUP_INTERVAL_MS / 60000} minutes.`);
// WebSocket connection using the io instance from socketSetup
socketSetup_1.io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('joinRoom', (_a) => __awaiter(void 0, [_a], void 0, function* ({ roomCode, userId, playerName }) {
        var _b;
        if (!roomCode || !userId) { // PlayerName check can be added if strictly required
            console.error('joinRoom event: Missing roomCode or userId. PlayerName:', playerName);
            socket.emit('error', { message: 'RoomCode and UserId are required to join a room.' });
            return;
        }
        try {
            console.log(`Socket ${socket.id} attempting to join room: ${roomCode} as userId: ${userId}, playerName: ${playerName}`);
            // Validate room existence (optional, but good practice)
            const roomExistsQuery = 'SELECT * FROM games WHERE room_code = $1';
            const roomResult = yield db_2.default.query(roomExistsQuery, [roomCode]);
            if (roomResult.rows.length === 0) {
                console.warn(`Socket ${socket.id} tried to join non-existent room: ${roomCode}`);
                socket.emit('error', { message: `Room ${roomCode} does not exist.` });
                return;
            }
            // Validate userId existence in the players table for that room (optional, but good practice)
            // This step assumes a player record should already exist from an HTTP join or similar
            const playerExistsQuery = 'SELECT * FROM players WHERE userId = $1 AND room_code = $2';
            const playerResult = yield db_2.default.query(playerExistsQuery, [userId, roomCode]);
            if (playerResult.rows.length === 0) {
                console.warn(`Socket ${socket.id} (userId: ${userId}) not found in players table for room ${roomCode}. PlayerName from socket: ${playerName}`);
                // Depending on game logic, you might auto-add them here or emit an error.
                // For now, let's assume an HTTP join should have created the player.
                // If playerName is provided and you want to create/update player here:
                if (playerName) {
                    // Potentially upsert player name if it's different or player doesn't exist
                    // const upsertPlayerQuery = `
                    //   INSERT INTO players (userId, room_code, name, score, lives) 
                    //   VALUES ($1, $2, $3, 0, 3) 
                    //   ON CONFLICT (userId, room_code) 
                    //   DO UPDATE SET name = $3
                    //   RETURNING *;
                    // `;
                    // await pool.query(upsertPlayerQuery, [userId, roomCode, playerName]);
                    // console.log(`Player ${playerName} (userId: ${userId}) ensured in room ${roomCode}`);
                }
                else {
                    // If playerName is crucial for socket join logic beyond just identification
                    // socket.emit('error', { message: `Player ${userId} not registered in room ${roomCode}. PlayerName missing.` });
                    // return;
                }
            }
            else {
                console.log(`Player ${playerResult.rows[0].name} (userId: ${userId}) confirmed in room ${roomCode}. Socket PlayerName: ${playerName}`);
            }
            yield socket.join(roomCode);
            console.log(`Socket ${socket.id} (userId: ${userId}) successfully joined room: ${roomCode}`);
            socket.emit('joinedRoom', { roomCode, userId });
            // Optionally, broadcast to other users in the room that a new user has joined
            socket.to(roomCode).emit('userJoined', { userId, playerName: playerName || ((_b = playerResult.rows[0]) === null || _b === void 0 ? void 0 : _b.name) || 'New User' });
        }
        catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room due to server error' });
        }
    }));
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
    });
});
// Replace app.listen with server.listen
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
// No longer export io from here; it's managed by socketSetup.ts
