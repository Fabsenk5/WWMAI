import { Pool } from 'pg';
import { Server } from 'socket.io'; // Import Server from socket.io

// Log the resolved database host explicitly
const resolvedHost = process.env.PGHOST || process.env.DB_HOST || 'db';
console.log('Resolved Database Host:', resolvedHost);

// Use connection string for configuration
const connectionString = `postgresql://${process.env.DB_USER || 'your_username'}:${process.env.DB_PASSWORD || 'your_password'}@${resolvedHost}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'wer_wird_millionaer'}`;
console.log('Using connection string:', connectionString);

// Ensure the pool instance is correctly instantiated and supports the 'on' method
const pool = new Pool({ connectionString });

// Add error logging for connection issues
if (typeof pool.on === 'function') {
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1); // Exit if the pool encounters a critical error
    });
} else {
    console.warn('The pool instance does not support the .on method. Skipping error listener setup.');
}

// Export the single pool instance
export default pool;

// Modify the database module to accept the io instance as a parameter
let ioInstance: Server;

export const initializeDatabase = (io: Server) => {
    ioInstance = io;
    console.log('Socket.io instance initialized in db module');
};

// Keep utility functions, ensure they use the exported pool
export const getQuestions = async (category: string, difficulty: string) => {
    const query = `
        SELECT * FROM questions
        WHERE category = $1 AND difficulty = $2
    `;
    const values = [category, difficulty];
    const { rows } = await pool.query(query, values);
    return rows;
};

export const getQuestionById = async (id: number) => {
    const query = `
        SELECT * FROM questions
        WHERE id = $1
    `;
    const values = [id];
    const { rows } = await pool.query(query, values);
    return rows[0];
};

// Keep connection retry logic
export const connectWithRetry = async (retries = 5, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect(); // Try to connect
            console.log('Connected to the database');
            client.release(); // Release the client immediately
            return;
        } catch (error) {
            console.error(`Database connection failed. Retrying in ${delay}ms... Attempt ${i + 1}/${retries}`);
            if (i < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                console.error('Failed to connect to the database after multiple attempts');
                throw error; // Re-throw the error after final attempt
            }
        }
    }
};

const createPlayerQuery = `INSERT INTO players (userId, room_code, name) VALUES ($1, $2, $3)`;

// Function to query current players in all active game rooms
export const queryActivePlayers = () => {
    if (!ioInstance) {
        throw new Error('Socket.io instance is not initialized. Call initializeDatabase first.');
    }

    const activeRooms = ioInstance.sockets.adapter.rooms;
    const playersInRooms: Record<string, string[]> = {};

    activeRooms.forEach((sockets, roomCode) => {
        if (ioInstance.sockets.adapter.sids.get(roomCode)) {
            return;
        }

        playersInRooms[roomCode] = Array.from(sockets).flatMap((socketId) => {
            const socket = ioInstance.sockets.sockets.get(socketId);
            return socket?.handshake.query.userId || 'Unknown';
        });
    });

    return playersInRooms;
};

// Function to add a player to the database
export const addPlayerToGame = async (playerId: string, roomCode: string, playerName: string) => {
    const query = `
    INSERT INTO players (player_id, room_code, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (player_id, room_code) DO NOTHING
  `;
    const values = [playerId, roomCode, playerName];
    await pool.query(query, values);
};