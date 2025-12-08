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
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPlayerToGame = exports.queryActivePlayers = exports.connectWithRetry = exports.getQuestionById = exports.getQuestions = exports.initializeDatabase = void 0;
const pg_1 = require("pg");
// Log the resolved database host explicitly
const resolvedHost = process.env.PGHOST || process.env.DB_HOST || 'db';
console.log('Resolved Database Host:', resolvedHost);
// Use connection string for configuration
const connectionString = `postgresql://${process.env.DB_USER || 'your_username'}:${process.env.DB_PASSWORD || 'your_password'}@${resolvedHost}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'wer_wird_millionaer'}`;
console.log('Using connection string:', connectionString);
// Ensure the pool instance is correctly instantiated and supports the 'on' method
const pool = new pg_1.Pool({ connectionString });
// Add error logging for connection issues
if (typeof pool.on === 'function') {
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1); // Exit if the pool encounters a critical error
    });
}
else {
    console.warn('The pool instance does not support the .on method. Skipping error listener setup.');
}
// Export the single pool instance
exports.default = pool;
// Modify the database module to accept the io instance as a parameter
let ioInstance;
const initializeDatabase = (io) => {
    ioInstance = io;
    console.log('Socket.io instance initialized in db module:', ioInstance);
};
exports.initializeDatabase = initializeDatabase;
// Keep utility functions, ensure they use the exported pool
const getQuestions = (category, difficulty) => __awaiter(void 0, void 0, void 0, function* () {
    const query = `
        SELECT * FROM questions
        WHERE category = $1 AND difficulty = $2
    `;
    const values = [category, difficulty];
    const { rows } = yield pool.query(query, values);
    return rows;
});
exports.getQuestions = getQuestions;
const getQuestionById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const query = `
        SELECT * FROM questions
        WHERE id = $1
    `;
    const values = [id];
    const { rows } = yield pool.query(query, values);
    return rows[0];
});
exports.getQuestionById = getQuestionById;
// Keep connection retry logic
const connectWithRetry = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const client = yield pool.connect(); // Try to connect
            console.log('Connected to the database');
            client.release(); // Release the client immediately
            return;
        }
        catch (error) {
            console.error(`Database connection failed. Retrying in ${delay}ms... Attempt ${i + 1}/${retries}`);
            if (i < retries - 1) {
                yield new Promise((resolve) => setTimeout(resolve, delay));
            }
            else {
                console.error('Failed to connect to the database after multiple attempts');
                throw error; // Re-throw the error after final attempt
            }
        }
    }
});
exports.connectWithRetry = connectWithRetry;
const createPlayerQuery = `INSERT INTO players (userId, room_code, name) VALUES ($1, $2, $3)`;
// Function to query current players in all active game rooms
const queryActivePlayers = () => {
    if (!ioInstance) {
        throw new Error('Socket.io instance is not initialized. Call initializeDatabase first.');
    }
    const activeRooms = ioInstance.sockets.adapter.rooms;
    const playersInRooms = {};
    activeRooms.forEach((sockets, roomCode) => {
        if (ioInstance.sockets.adapter.sids.get(roomCode)) {
            return;
        }
        playersInRooms[roomCode] = Array.from(sockets).flatMap((socketId) => {
            const socket = ioInstance.sockets.sockets.get(socketId);
            return (socket === null || socket === void 0 ? void 0 : socket.handshake.query.userId) || 'Unknown';
        });
    });
    return playersInRooms;
};
exports.queryActivePlayers = queryActivePlayers;
// Function to add a player to the database
const addPlayerToGame = (playerId, roomCode, playerName) => __awaiter(void 0, void 0, void 0, function* () {
    const query = `
    INSERT INTO players (player_id, room_code, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (player_id, room_code) DO NOTHING
  `;
    const values = [playerId, roomCode, playerName];
    yield pool.query(query, values);
});
exports.addPlayerToGame = addPlayerToGame;
