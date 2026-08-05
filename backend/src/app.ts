import express from 'express';
// import { json } from 'body-parser'; // Removed to allow conditional parsing for webhooks
import { json } from 'express'; // Standard express json parser
import helmet from 'helmet';
import compression from 'compression';
import requestIp from 'request-ip';
import authRoutes from './routes/authRoutes';
import billingRoutes from './routes/billingRoutes'; // Import billingRoutes
import featureWishlistRoutes from './routes/featureWishlistRoutes'; // Import featureWishlistRoutes
import { connectWithRetry, initializeDatabase } from './database/db';
import pool from './database/db';
import { setRoutes } from './routes/gameRoutes';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Socket } from 'socket.io';
import { initializeSocket, io as socketIoInstance } from './socketSetup';
import { cleanupInactiveRooms } from './database/cleanupRooms';
import { cleanupSimilarQuestions } from './database/cleanupSimilarQuestions';
import { fillQuestionPools } from './database/fillQuestionPools';
import rateLimit from 'express-rate-limit';
import { createAdminRouter } from './routes/adminRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

app.set('trust proxy', 1);

// Security headers + response compression
app.use(helmet());
app.use(compression());

// Middleware

// IMPORTANT: Stripe Webhook needs RAW body. Mount it BEFORE 'express.json()'
app.use('/api/billing/webhook', express.raw({ type: 'application/json' })); // Use raw middleware ONLY for this route
app.use('/api/billing', billingRoutes); // Mount the router (which contains /webhook)

// Standard JSON parser for all OTHER routes
app.use(json());

app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', generalLimiter);

import { checkAndSeedDatabase } from './database/seed';
import { syncDatabaseSchema } from './database/sync_schema';

connectWithRetry().then(async () => {
    try {
        await syncDatabaseSchema();
        checkAndSeedDatabase();

        // Initial keep-alive check after DB is ready
        performKeepAlive();
    } catch (err) {
        console.error('Failed to sync schema on startup:', err);
    }
});

// Keep-alive mechanism to prevent DB sleep (and keep Render backend active)
const performKeepAlive = async () => {
    try {
        console.log(`[${new Date().toISOString()}] Performing DB keep-alive check...`);
        // Simple ping to keep connection alive
        await pool.query('SELECT 1');
        console.log(`[${new Date().toISOString()}] DB keep-alive check successful`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] DB keep-alive check failed:`, error);
    }
};

// Run every 14 minutes (keeps Render awake, but allows Neon to conserve compute)
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000;
if (process.env.NODE_ENV !== 'test') {
    setInterval(performKeepAlive, KEEP_ALIVE_INTERVAL);
    console.log('[App] Database keep-alive scheduled every 14 minutes.');
}

const server = createServer(app);

initializeSocket(server);
console.log('Socket.IO instance obtained from socketSetup in app.ts:', socketIoInstance ? 'OK' : 'Failed or not yet assigned');

initializeDatabase(socketIoInstance);

setRoutes(app);

app.use('/api/admin', createAdminRouter(pool));
app.use('/api/auth', authRoutes);
app.use('/api/feature-wishes', featureWishlistRoutes);

// Enhanced health endpoint with DB validation
app.get('/health', async (req, res) => {
    const startTime = Date.now();
    let dbAlive = false;

    try {
        const result = await pool.query('SELECT 1 as alive');
        dbAlive = result.rows[0]?.alive === 1;
    } catch (error) {
        console.error('[Health] Database ping failed:', error);
    }

    const responseTime = Date.now() - startTime;

    res.json({
        status: 'ok',
        database: dbAlive ? 'connected' : 'error',
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
    });
});

if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        cleanupInactiveRooms().catch(err => {
            console.error("[App] Error during scheduled room cleanup:", err);
        });
    }, ROOM_CLEANUP_INTERVAL_MS);
    console.log('[App] Scheduled inactive room cleanup to run every ' + (ROOM_CLEANUP_INTERVAL_MS / 60000) + ' minutes.');

    // Question-pool maintenance: 1x per day (backfills embeddings, deactivates
    // near-duplicates and tops up categories below the pool target)
    const QUESTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setInterval(() => {
        runQuestionMaintenance();
    }, QUESTION_CLEANUP_INTERVAL_MS);
    console.log('[App] Scheduled question pool maintenance (cleanup + fill) to run every 24 hours.');

    // Initial maintenance shortly after boot. Render Free cold-starts the
    // process on every wake-up, so long setInterval jobs may never fire —
    // running cleanup + fill on boot keeps the pools growing. The 6h per-category
    // cooldown inside ensureCategoryPool keeps API usage in check.
    setTimeout(() => {
        runQuestionMaintenance();
    }, 60 * 1000);
    console.log('[App] Initial question pool maintenance scheduled 60s after boot.');
}

// Sequential cleanup -> fill (shared by boot and the 24h interval; keeps RAM
// usage predictable on the 512MB free tier)
async function runQuestionMaintenance(): Promise<void> {
    try {
        await cleanupSimilarQuestions();
    } catch (err) {
        console.error('[App] Question similarity cleanup failed:', err);
    }
    try {
        await fillQuestionPools();
    } catch (err) {
        console.error('[App] Question pool fill failed:', err);
    }
}

interface JoinRoomPayload {
    roomCode: string;
    userId: string;
    playerName?: string;
}

// Simple per-socket rate limiting for chat/emote spam (in-memory, entries expire)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const isRateLimited = (key: string, limit: number, windowMs: number): boolean => {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
        rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
};

socketIoInstance.on('connection', (socket: Socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', async ({ roomCode, userId, playerName }: JoinRoomPayload) => {
        if (!roomCode || !userId) {
            console.error('joinRoom event: Missing roomCode or userId. PlayerName:', playerName);
            socket.emit('error', { message: 'RoomCode and UserId are required to join a room.' });
            return;
        }
        try {
            console.log(`Socket ${socket.id} attempting to join room: ${roomCode} as userId: ${userId}, playerName: ${playerName} `);

            const roomExistsQuery = 'SELECT game_id, host_id FROM games WHERE room_code = $1';
            const roomResult = await pool.query(roomExistsQuery, [roomCode]);
            if (roomResult.rows.length === 0) {
                console.warn(`Socket ${socket.id} tried to join non - existent room: ${roomCode} `);
                socket.emit('error', { message: `Room ${roomCode} does not exist.` });
                return;
            }

            const playerExistsQuery = 'SELECT * FROM players WHERE userId = $1 AND room_code = $2';
            const playerResult = await pool.query(playerExistsQuery, [userId, roomCode]);
            if (playerResult.rows.length === 0) {
                // Not a player in this room — allow only the game host (moderator mode)
                const hostId = roomResult.rows[0]?.host_id;
                if (hostId === null || hostId === undefined || String(hostId) !== String(userId)) {
                    console.warn(`Socket ${socket.id} (userId: ${userId}) is not a member of room ${roomCode}. Rejecting join.`);
                    socket.emit('error', { message: 'You are not a member of this room.' });
                    return;
                }
                console.log(`Socket ${socket.id} (userId: ${userId}) joined as HOST of room ${roomCode}.`);
            } else {
                console.log(`Player ${playerResult.rows[0].name} (userId: ${userId}) confirmed in room ${roomCode}. Socket PlayerName: ${playerName}`);
            }

            await socket.join(roomCode);
            // Remember room membership for disconnect broadcasting
            socket.data.roomCode = roomCode;
            socket.data.userId = userId;
            console.log(`Socket ${socket.id} (userId: ${userId}) successfully joined room: ${roomCode}`);
            socket.emit('joinedRoom', { roomCode, userId });

            socket.to(roomCode).emit('userJoined', { userId, playerName: playerName || playerResult.rows[0]?.name || 'New User' });

        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room due to server error' });
        }
    });

    socket.on('playerEmote', (data: { emote: string }) => {
        const roomCode = socket.data.roomCode as string | undefined;
        if (!roomCode || !data?.emote) return;
        if (isRateLimited(`emote:${socket.id}`, 20, 10 * 1000)) {
            socket.emit('error', { message: 'Emote rate limit reached. Slow down!' });
            return;
        }
        socket.to(roomCode).emit('playerEmote', {
            userId: socket.data.userId,
            emote: String(data.emote).slice(0, 8),
        });
    });

    socket.on('chatMessage', (data: { text: string }) => {
        const roomCode = socket.data.roomCode as string | undefined;
        if (!roomCode || !data?.text) return;
        if (isRateLimited(`chat:${socket.id}`, 10, 10 * 1000)) {
            socket.emit('error', { message: 'Chat rate limit reached. Slow down!' });
            return;
        }
        socket.to(roomCode).emit('chatMessage', {
            userId: socket.data.userId,
            text: String(data.text).slice(0, 200),
        });
    });

    socket.on('disconnect', () => {
        // Let the room know this player went offline (if they had joined a room)
        const roomCode = socket.data.roomCode as string | undefined;
        const userId = socket.data.userId as string | undefined;
        if (roomCode && userId) {
            socket.to(roomCode).emit('playerDisconnected', { userId });
        }
        console.log('A user disconnected:', socket.id);
    });
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

export { server };
export { socketIoInstance as io };