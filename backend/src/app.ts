import express from 'express';
import { json } from 'body-parser';
import { connectWithRetry, initializeDatabase } from './database/db'; // Import initializeDatabase function
import pool from './database/db'; // <--- ADD THIS LINE
import { setRoutes } from './routes/gameRoutes';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
// import { Server, Socket } from 'socket.io'; // Server is no longer imported directly here
import { Socket } from 'socket.io'; // Socket type for event handlers
import { initializeSocket, io as socketIoInstance } from './socketSetup'; // Import from new file
import { cleanupInactiveRooms } from './database/cleanupRooms'; // Import the cleanup function

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// Middleware
app.use(json());
app.use(cors({
    origin: process.env.CLIENT_URL || '*', // Allow configured client or all (dev)
    credentials: true
}));

// Database connection
connectWithRetry();

// Set up routes
// setRoutes(app); // Moved after io initialization

const server = createServer(app);

// Initialize Socket.IO using the HttpServer instance
initializeSocket(server); // This will initialize and export 'io' from socketSetup.ts
console.log('Socket.IO instance obtained from socketSetup in app.ts:', socketIoInstance ? 'OK' : 'Failed or not yet assigned');

// Initialize the database with the io instance from socketSetup
initializeDatabase(socketIoInstance); // Pass the imported io instance

// Set up routes - must be after io is initialized and passed to GameController
setRoutes(app);

import { createAdminRouter } from './routes/adminRoutes';
app.use('/api/admin', createAdminRouter(pool));


// Start periodic room cleanup
setInterval(() => {
    cleanupInactiveRooms().catch(err => {
        console.error("[App] Error during scheduled room cleanup:", err);
    });
}, ROOM_CLEANUP_INTERVAL_MS);
console.log(`[App] Scheduled inactive room cleanup to run every ${ROOM_CLEANUP_INTERVAL_MS / 60000} minutes.`);

interface JoinRoomPayload {
    roomCode: string;
    userId: string;
    playerName?: string; // Make playerName optional or handle if it's always expected
}

// WebSocket connection using the io instance from socketSetup
socketIoInstance.on('connection', (socket: Socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', async ({ roomCode, userId, playerName }: JoinRoomPayload) => {
        if (!roomCode || !userId) { // PlayerName check can be added if strictly required
            console.error('joinRoom event: Missing roomCode or userId. PlayerName:', playerName);
            socket.emit('error', { message: 'RoomCode and UserId are required to join a room.' });
            return;
        }
        try {
            console.log(`Socket ${socket.id} attempting to join room: ${roomCode} as userId: ${userId}, playerName: ${playerName}`);

            // Validate room existence (optional, but good practice)
            const roomExistsQuery = 'SELECT * FROM games WHERE room_code = $1';
            const roomResult = await pool.query(roomExistsQuery, [roomCode]);
            if (roomResult.rows.length === 0) {
                console.warn(`Socket ${socket.id} tried to join non-existent room: ${roomCode}`);
                socket.emit('error', { message: `Room ${roomCode} does not exist.` });
                return;
            }

            // Validate userId existence in the players table for that room (optional, but good practice)
            // This step assumes a player record should already exist from an HTTP join or similar
            const playerExistsQuery = 'SELECT * FROM players WHERE userId = $1 AND room_code = $2';
            const playerResult = await pool.query(playerExistsQuery, [userId, roomCode]);
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
                } else {
                    // If playerName is crucial for socket join logic beyond just identification
                    // socket.emit('error', { message: `Player ${userId} not registered in room ${roomCode}. PlayerName missing.` });
                    // return;
                }
            } else {
                console.log(`Player ${playerResult.rows[0].name} (userId: ${userId}) confirmed in room ${roomCode}. Socket PlayerName: ${playerName}`);
            }

            await socket.join(roomCode);
            console.log(`Socket ${socket.id} (userId: ${userId}) successfully joined room: ${roomCode}`);
            socket.emit('joinedRoom', { roomCode, userId });

            // Optionally, broadcast to other users in the room that a new user has joined
            socket.to(roomCode).emit('userJoined', { userId, playerName: playerName || playerResult.rows[0]?.name || 'New User' });

        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room due to server error' });
        }
    });

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

// Remove duplicate export of io
export { server }; // Only export server explicitly
// No longer export io from here; it's managed by socketSetup.ts