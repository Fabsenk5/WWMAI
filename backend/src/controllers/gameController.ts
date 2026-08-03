import { Request, Response } from 'express';
import { QuestionModel } from '../models/questionModel';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io'; // Import the type
import { AiService } from '../services/aiService';

// Helper function to shuffle an array
function shuffle(array: any[]): any[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Define prize amounts as a standalone constant at the module level
const PRIZE_AMOUNTS = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];

// Helper function for getting prize - completely independent of class
export function getPrizeForLevel(level: number): number {
    return PRIZE_AMOUNTS[level - 1] || 0;
}

interface PendingTimer {
    kind: 'round' | 'advance';
    remainingMs: number;
    startedAt: number;
    timer?: NodeJS.Timeout;
    gameId: number;
    currentLevel: number;
    waitTimeInfo: number;
    correctAnswer?: string;
    playerCount?: number;
    lives?: number;
}

export class GameController {
    private questionModel: QuestionModel;
    private db: Pool;
    private io: SocketIOServer; // Add io property
    private aiService: AiService;
    // Per-room pending timers (question timeout + advance-to-next-question),
    // pausable by the host. Keyed by roomCode.
    private roomTimers: Map<string, PendingTimer> = new Map();
    private static readonly QUESTION_TIMEOUT_MS = 45 * 1000;

    // Helper to update stats
    private async finalizeGameStats(roomCode: string, gameMode: string, result: 'win' | 'loss', finalLevel: number): Promise<void> {
        console.log(`[finalizeGameStats] invoked for room ${roomCode}, mode: ${gameMode}, result: ${result}`);
        try {
            const playersRes = await this.db.query('SELECT userId, score, lives FROM players WHERE room_code = $1', [roomCode]);
            console.log(`[finalizeGameStats] Players found:`, playersRes.rows);
            const prize = getPrizeForLevel(finalLevel); // For Co-op global prize

            for (const p of playersRes.rows) {
                console.log(`[finalizeGameStats] Processing player:`, p);

                // Safe check for numeric ID (registered user)
                if (!p.userid || !/^\d+$/.test(String(p.userid))) {
                    console.log(`[finalizeGameStats] Skipping guest/invalid user: ${p.userid}`);
                    continue; // Skip guests
                }

                const uid = p.userid;
                let isWinner = false;
                let earnings = 0;

                if (gameMode === 'survival') {
                    isWinner = result === 'win' && p.lives > 0;
                    earnings = p.score || 0;
                } else {
                    // Co-op
                    isWinner = result === 'win';
                    // If not winner, get score. If score is missing (bug safeguard), get prize for COMPLETED level (current - 1).
                    earnings = isWinner ? 1000000 : (p.score || getPrizeForLevel(finalLevel - 1));
                }

                console.log(`[finalizeGameStats] Updating user ${uid}. Winner: ${isWinner}, Earnings: ${earnings}`);

                if (isWinner) {
                    await this.db.query(`
                        UPDATE users SET 
                            games_played = COALESCE(games_played, 0) + 1,
                            games_won = COALESCE(games_won, 0) + 1,
                            total_earnings = COALESCE(total_earnings, 0) + $1,
                            current_win_streak = COALESCE(current_win_streak, 0) + 1,
                            longest_win_streak = GREATEST(COALESCE(longest_win_streak, 0), COALESCE(current_win_streak, 0) + 1)
                        WHERE id = $2
                    `, [earnings, uid]);
                } else {
                    await this.db.query(`
                        UPDATE users SET 
                            games_played = COALESCE(games_played, 0) + 1,
                            total_earnings = COALESCE(total_earnings, 0) + $1,
                            current_win_streak = 0
                        WHERE id = $2
                    `, [earnings, uid]);
                }
            }
        } catch (e) {
            console.error('Error finalizing stats:', e);
        }
    }

    // Helper method to advance to the next question
    private async advanceToNextQuestion(roomCode: string, gameId: number, currentLevel: number): Promise<void> {
        this.clearRoomTimer(roomCode); // ensure no stale timers for this room
        try {
            // 50:50 removals only apply to the question they were used on
            await this.db.query(`UPDATE games SET jokers_5050_removed = '{}' WHERE room_code = $1`, [roomCode]);
            await this.db.query(`UPDATE players SET jokers_5050_removed = '{}' WHERE room_code = $1`, [roomCode]);
            console.log(`Advancing game in room ${roomCode} from level ${currentLevel} to ${currentLevel + 1}`);

            // Check if it was the last level
            if (currentLevel >= 15) {
                console.log(`Game in room ${roomCode} has reached the maximum level. Ending game.`);

                // Update game status to 'ended'
                const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                await this.db.query(endGameQuery, [gameId]);

                // Finalize Stats (Co-op Win or Survival Timeout Win?)
                // Usually this flow is for Co-op max level. Survival might check separately.
                // Assuming Co-op here since Survival usually loops in submitAnswer.
                // But check gameMode first.
                const gmRes = await this.db.query('SELECT game_mode FROM games WHERE game_id = $1', [gameId]);
                const gm = gmRes.rows[0]?.game_mode || 'cooperative';
                await this.finalizeGameStats(roomCode, gm, 'win', 15);

                // Emit gameEnded event
                this.io.to(roomCode).emit('gameEnded', { message: 'Game has ended. Maximum level reached.' });
                return;
            }

            // Fetch used question IDs to prevent duplicates
            const usedQuestionsQuery = `SELECT DISTINCT question_id FROM player_answers WHERE room_code = $1`;
            const usedQuestionsResult = await this.db.query(usedQuestionsQuery, [roomCode]);
            const excludeIds = usedQuestionsResult.rows
                .map((row: any) => row.question_id)
                .filter((id: any) => id !== null && id !== undefined); // NULLs would break NOT IN
            console.log(`[advanceToNextQuestion] Excluding IDs: ${excludeIds.join(', ')}`);

            // Load embeddings of already-used questions so the next pick can be
            // semantically distant (round diversity)
            let usedEmbeddings: number[][] = [];
            try {
                const usedEmbRes = await this.db.query(
                    `SELECT q.embedding FROM player_answers pa JOIN questions q ON q.id = pa.question_id WHERE pa.room_code = $1 AND q.embedding IS NOT NULL`,
                    [roomCode]
                );
                usedEmbeddings = usedEmbRes.rows
                    .map((r: any) => r.embedding)
                    .filter((e: any) => Array.isArray(e) && e.length > 0);
            } catch (embErr) {
                console.warn('[advanceToNextQuestion] Failed to load used embeddings:', embErr);
            }

            // Fetch game categories, difficulty and round config
            const gameQuery = `SELECT selected_categories, difficulty_mode, player_count, lives, wait_time FROM games WHERE game_id = $1`;
            const gameResult = await this.db.query(gameQuery, [gameId]);
            const gameRow = gameResult.rows[0] || {};
            const categories = gameRow.selected_categories || null;
            const difficultyMode = gameRow.difficulty_mode || 'standard';
            const playerCount = gameRow.player_count ?? 10;
            const gameLives = gameRow.lives ?? 3;
            const waitTimeInfo = gameRow.wait_time ?? 15;

            // Fetch the next question
            const nextLevel = currentLevel + 1;
            const nextQuestion = await this.questionModel.getQuestionByLevel(nextLevel, excludeIds, categories, difficultyMode, usedEmbeddings);

            if (!nextQuestion) {
                console.error(`Failed to fetch question for level ${nextLevel}`);
                // End game if no next question is available
                const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                await this.db.query(endGameQuery, [gameId]);
                this.io.to(roomCode).emit('gameEnded', { message: 'Game has ended. No more questions available.' });
                return;
            }

            // Update game to next level and next question
            const updateGameQuery = `
                UPDATE games 
                SET current_level = $1, current_question_id = $2, last_active = CURRENT_TIMESTAMP 
                WHERE game_id = $3
            `;
            await this.db.query(updateGameQuery, [nextLevel, nextQuestion.id, gameId]);

            // Prepare rich options (shuffled with translations)
            const options = this.getConsistentOptions(
                nextQuestion.id,
                [...nextQuestion.incorrect_answers, nextQuestion.correct_answer],
                nextQuestion.translations
            );

            // Extract question text translations
            const questionTranslations: Record<string, string> = {};
            if (nextQuestion.translations) {
                for (const [lang, data] of Object.entries(nextQuestion.translations) as [string, any][]) {
                    questionTranslations[lang] = data.question;
                }
            }

            const questionToSendToSocket = {
                id: nextQuestion.id,
                category: nextQuestion.category,
                difficulty: nextQuestion.difficulty,
                question: nextQuestion.question,
                questionTranslations: questionTranslations, // Safe translations for question text only
                level: nextLevel,
                prize: getPrizeForLevel(nextLevel),
                options: options, // Now containing { text, translations } objects
                answerDeadline: Date.now() + GameController.QUESTION_TIMEOUT_MS
            };

            // Emit newQuestion event
            console.log(`Emitting newQuestion event for level ${nextLevel} in room ${roomCode}`);
            this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);

            // Arm the round timer as soon as the question is broadcast (deadline
            // matches answerDeadline in the payload so clients show the same countdown)
            this.startRoundTimer(roomCode, gameId, nextLevel, waitTimeInfo, nextQuestion.correct_answer, playerCount, gameLives);

        } catch (error) {
            console.error('Error in advanceToNextQuestion:', error);
            throw error;
        }
    }

    private getConsistentOptions(questionId: number, options: string[], translations: any): any[] {
        let richOptions: any[] = [];
        const incorrectCount = options.length - 1; // Last one is correct

        // Map Incorrect
        for (let i = 0; i < incorrectCount; i++) {
            const enText = options[i];
            const trans: Record<string, string> = {};
            if (translations) {
                for (const [lang, data] of Object.entries(translations) as [string, any][]) {
                    if (data.incorrect_answers && data.incorrect_answers[i]) {
                        trans[lang] = data.incorrect_answers[i];
                    }
                }
            }
            richOptions.push({ text: enText, translations: trans });
        }

        // Map Correct
        const correctText = options[incorrectCount];
        const correctTrans: Record<string, string> = {};
        if (translations) {
            for (const [lang, data] of Object.entries(translations) as [string, any][]) {
                if (data.correct_answer) {
                    correctTrans[lang] = data.correct_answer;
                }
            }
        }
        richOptions.push({ text: correctText, translations: correctTrans });

        // Shuffle
        const sortedOptions = [...richOptions];
        const seed = questionId;
        for (let i = sortedOptions.length - 1; i > 0; i--) {
            const hash = (seed * 9301 + i * 49297) % 233280;
            const j = hash % (i + 1);
            [sortedOptions[i], sortedOptions[j]] = [sortedOptions[j], sortedOptions[i]];
        }

        return sortedOptions;
    }

    constructor(dbPool: Pool, io: SocketIOServer) {
        this.db = dbPool;
        this.questionModel = new QuestionModel(this.db);
        this.io = io;
        this.aiService = new AiService(this.db);
        console.log('GameController instantiated with io and AiService');
    }

    // Updated Endpoint: Fetch all unique categories
    public async getCategories(req: Request, res: Response): Promise<void> {
        try {
            const query = `SELECT DISTINCT category FROM questions ORDER BY category ASC`;
            const result = await this.db.query(query);
            const categories = result.rows.map(row => row.category);
            res.status(200).json(categories);
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    }

    public kickPlayer = async (req: Request | any, res: Response): Promise<void> => {
        try {
            const { roomCode } = req.params;
            const { userIdToKick } = req.body;
            const requesterId = req.user?.userId;

            if (!requesterId || !userIdToKick) {
                res.status(400).json({ error: 'Missing requester or target ID' });
                return;
            }

            // 1. Verify Game Host (creator) AND Premium Status
            const gameQuery = `SELECT host_id FROM games WHERE room_code = $1`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            const hostId = gameResult.rows[0].host_id;

            if (hostId !== requesterId) {
                res.status(403).json({ error: 'Only the host can kick players.' });
                return;
            }

            // Check if host is premium — fresh from DB (JWT role can be stale for up to 24h)
            const statusQuery = `SELECT subscription_status FROM users WHERE id = $1`;
            const statusResult = await this.db.query(statusQuery, [requesterId]);
            if (statusResult.rows.length === 0 || statusResult.rows[0].subscription_status !== 'premium') {
                res.status(403).json({ error: 'Host kick function is a Premium feature.' });
                return;
            }

            // 2. Perform Kick (Remove from players table)
            // Note: Does not block re-joining (ban) but removes them now.
            const deleteQuery = `DELETE FROM players WHERE userId = $1 AND room_code = $2 RETURNING name`;
            const deleteResult = await this.db.query(deleteQuery, [userIdToKick, roomCode]);

            if (deleteResult.rowCount === 0) {
                res.status(404).json({ error: 'Player not found in this room.' });
                return;
            }

            const kickedName = deleteResult.rows[0].name;

            // Keep user_count in sync
            await this.db.query(
                `UPDATE games SET user_count = (SELECT COUNT(*) FROM players WHERE room_code = $1) WHERE room_code = $1`,
                [roomCode]
            );

            // 3. Emit Socket Event
            this.io.to(roomCode).emit('playerKicked', { userId: userIdToKick, name: kickedName });

            console.log(`Host ${requesterId} kicked player ${userIdToKick} (${kickedName}) from room ${roomCode}`);
            res.status(200).json({ message: 'Player kicked successfully' });

        } catch (error) {
            console.error('Error kicking player:', error);
            res.status(500).json({ error: 'Server error' });
        }
    };

    public leaveGame = async (req: Request, res: Response): Promise<void> => {
        try {
            const { roomCode } = req.params;
            const { userId } = req.body;

            if (!roomCode || !userId) {
                res.status(400).json({ error: 'Room code and user ID are required' });
                return;
            }

            const deleteResult = await this.db.query(
                `DELETE FROM players WHERE userId = $1 AND room_code = $2 RETURNING name`,
                [userId, roomCode]
            );

            if (deleteResult.rowCount === 0) {
                res.status(404).json({ error: 'Player not found in this room.' });
                return;
            }

            // Keep user_count in sync
            await this.db.query(
                `UPDATE games SET user_count = (SELECT COUNT(*) FROM players WHERE room_code = $1) WHERE room_code = $1`,
                [roomCode]
            );

            this.io.to(roomCode).emit('playerLeft', { userId, name: deleteResult.rows[0].name });
            res.status(200).json({ message: 'Player left the game' });

        } catch (error) {
            console.error('Error leaving game:', error);
            res.status(500).json({ error: 'Server error' });
        }
    };

    public pauseGame = async (req: Request | any, res: Response): Promise<void> => {
        try {
            const { roomCode } = req.params;
            const requesterId = req.user?.userId;

            const gameRes = await this.db.query('SELECT game_id, host_id, status FROM games WHERE room_code = $1', [roomCode]);
            if (gameRes.rows.length === 0) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }
            const game = gameRes.rows[0];
            if (game.host_id === null || game.host_id === undefined || String(game.host_id) !== String(requesterId)) {
                res.status(403).json({ error: 'Unauthorized' });
                return;
            }

            if (game.status === 'paused') {
                // RESUME
                await this.db.query(
                    `UPDATE games SET status = 'started', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`,
                    [game.game_id]
                );
                // Resume pending timer with the remaining time
                const entry = this.roomTimers.get(roomCode);
                if (entry && !entry.timer && entry.remainingMs > 0) {
                    entry.startedAt = Date.now();
                    entry.timer = setTimeout(() => this.fireRoomTimer(roomCode), entry.remainingMs);
                }
                this.io.to(roomCode).emit('gameResumed', { message: 'Game resumed by host' });
                res.status(200).json({ message: 'Game resumed', paused: false });

            } else if (game.status === 'started') {
                // PAUSE
                await this.db.query(
                    `UPDATE games SET status = 'paused' WHERE game_id = $1`,
                    [game.game_id]
                );
                // Pause pending timer, keep the remaining time
                const entry = this.roomTimers.get(roomCode);
                if (entry?.timer) {
                    clearTimeout(entry.timer);
                    entry.timer = undefined;
                    entry.remainingMs = Math.max(0, entry.remainingMs - (Date.now() - entry.startedAt));
                    console.log(`[Pause] Room ${roomCode} paused with ${(entry.remainingMs / 1000).toFixed(0)}s left on timer.`);
                }
                this.io.to(roomCode).emit('gamePaused', { message: 'Game paused by host' });
                res.status(200).json({ message: 'Game paused', paused: true });

            } else {
                res.status(409).json({ error: 'Game is not running.' });
            }

        } catch (error) {
            console.error('Error pausing game:', error);
            res.status(500).json({ error: 'Server error' });
        }
    };

    public endGame = async (req: Request | any, res: Response): Promise<void> => {
        try {
            const { roomCode } = req.params;
            const requesterId = req.user?.userId;

            const gameRes = await this.db.query('SELECT game_id, host_id FROM games WHERE room_code = $1', [roomCode]);
            if (gameRes.rows.length === 0 || gameRes.rows[0].host_id !== requesterId) {
                res.status(403).json({ error: 'Unauthorized' });
                return;
            }

            await this.db.query("UPDATE games SET status = 'ended' WHERE game_id = $1", [gameRes.rows[0].game_id]);
            this.io.to(roomCode).emit('gameEnded', { message: 'Host ended the game.' });
            res.status(200).json({ message: 'Game ended' });

        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    };


    public async createGame(req: Request | any, res: Response): Promise<void> {
        try {
            const { gameName, playerCount, gameMode, lives, categories, customCategories, difficultyMode } = req.body;
            const user = req.user; // Auth middleware attaches this

            // --- PREMIUM CHECK ---
            // Fetch Global Settings
            const settingsRes = await this.db.query("SELECT key, value FROM system_settings WHERE key IN ('global_premium_unlocked', 'global_guest_premium_unlocked')");
            const globalSettings: Record<string, boolean> = {};
            settingsRes.rows.forEach(row => {
                globalSettings[row.key] = row.value === 'true';
            });

            const globalPremium = globalSettings['global_premium_unlocked'] || false;
            const globalGuest = globalSettings['global_guest_premium_unlocked'] || false;

            // Determine if the requestor has effective premium status
            let hasPremiumAccess = false;
            let freshStatus = 'unknown';

            if (user) {
                // Logged in user: Fetch FRESH subscription status from DB to avoid stale JWT issues
                console.log(`[createGame] User logged in. ID: ${user.userId}, Token Role: ${user.role}`);
                const userRes = await this.db.query("SELECT subscription_status FROM users WHERE id = $1", [user.userId]);
                freshStatus = userRes.rows.length > 0 ? userRes.rows[0].subscription_status : 'free';
                console.log(`[createGame] DB Status for user ${user.userId}: ${freshStatus}`);

                if (freshStatus === 'premium' || globalPremium) {
                    hasPremiumAccess = true;
                }
            } else {
                console.log('[createGame] Guest user.');
                // Guest: Has access if global guest premium is unlocked
                if (globalGuest) {
                    hasPremiumAccess = true;
                }
            }

            console.log(`[createGame] hasPremiumAccess: ${hasPremiumAccess}, GlobalPermission: ${globalPremium}, GlobalGuest: ${globalGuest}`);

            // Check Moderator Mode Premium Lock
            let finalModeratorMode = false;
            if (req.body.moderatorMode === true) {
                if (!hasPremiumAccess) {
                    console.warn(`[createGame] Blocked moderator mode. User: ${user?.userId}, Status: ${freshStatus}`);
                    res.status(403).json({ error: 'Host View (Moderator Mode) is a Premium feature.' });
                    return;
                }
                finalModeratorMode = true;
            }

            if (customCategories && customCategories.length > 0) {
                if (!hasPremiumAccess) {
                    console.warn(`[createGame] Blocked custom categories. User: ${user?.userId}, Status: ${freshStatus}`);
                    res.status(403).json({ error: 'Custom topics are for Premium users only.' });
                    return;
                }
            }

            // Check Difficulty Mode Premium Lock
            if (difficultyMode && difficultyMode !== 'standard') {
                if (!hasPremiumAccess) {
                    console.warn(`[createGame] Blocked difficulty selection. User: ${user?.userId}, Status: ${freshStatus}`);
                    res.status(403).json({ error: 'Difficulty selection is a Premium feature.' });
                    return;
                }
            }

            // Input Validation
            if (!gameName || gameName.length > 50) {
                res.status(400).json({ error: 'Invalid game name (max 50 chars)' });
                return;
            }
            if (playerCount <= 0) {
                res.status(400).json({ error: 'Player count must be positive' });
                return;
            }
            if (customCategories && customCategories.length > 50) {
                res.status(400).json({ error: 'Too many custom categories' });
                return;
            }

            const mode = gameMode || 'cooperative';
            const initialLives = lives || 3;
            const waitTime = req.body.waitTimer || 15;
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // Handle Categories - Combine both sources to trigger AI checks
            let selectedCategories: string[] = [];
            if (Array.isArray(categories)) {
                selectedCategories = [...selectedCategories, ...categories];
            }
            if (Array.isArray(customCategories)) {
                // Filter empty strings
                const validCustom = customCategories.filter((c: string) => c && c.trim() !== '');
                selectedCategories = [...selectedCategories, ...validCustom];
            }

            // Remove duplicates
            const uniqueCategories = [...new Set(selectedCategories)];
            selectedCategories = uniqueCategories; // Update for DB insert

            // Optimization: Scale threshold based on number of categories
            // Single category -> Target 50 -> 250 Total Pool Check
            // 10 categories -> Target 25 each
            const questionsPerCategory = Math.max(5, Math.floor(250 / Math.max(1, uniqueCategories.length)));

            try {
                // Trigger AI Generation check for ALL selected categories (standard & custom)
                uniqueCategories.forEach((category: string) => {
                    console.log(`[GameController] Checking pool for "${category}". Target: ${questionsPerCategory}`);
                    // No await here to keep it background
                    this.aiService.ensureCategoryPool(category, questionsPerCategory).catch(err => {
                        console.error(`[GameController] Background pool check failed for "${category}":`, err);
                    });
                });
            } catch (aiError) {
                console.error('[GameController] Error triggering AI service:', aiError);
            }

            // Insert game with selected_categories, host_id, difficulty_mode, AND moderator_mode
            const query = `
                INSERT INTO games (name, player_count, room_code, game_mode, lives, selected_categories, wait_time, host_id, difficulty_mode, moderator_mode) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                RETURNING game_id, room_code
            `;
            // Postgres array syntax for text[] is handled by node-postgres if passed as array
            const hostId = user ? user.userId : null;
            const difficultyModeVal = difficultyMode || 'standard';
            const values = [gameName, playerCount, roomCode, mode, initialLives, selectedCategories.length > 0 ? selectedCategories : null, waitTime, hostId, difficultyModeVal, finalModeratorMode];

            const result = await this.db.query(query, values);
            res.status(201).json({ message: 'Game created successfully', gameId: result.rows[0].game_id, roomCode: result.rows[0].room_code });
        } catch (error) {
            console.error('Error creating game:', error);
            res.status(500).json({ error: 'Failed to create game due to server error' });
        }
    }

    // Updated joinGame to handle duplicate player names
    public async joinGame(req: Request, res: Response): Promise<void> {
        try {
            const { roomCode, userName, userId } = req.body; // Ensure consistent naming

            console.log('joinGame called with:', { roomCode, userName, userId });

            if (!roomCode || !userName) {
                res.status(400).json({ error: 'Room code and user name are required' });
                return;
            }

            if (userName.length > 20) {
                res.status(400).json({ error: 'User name too long (max 20 chars)' });
                return;
            }

            // Use the correct column for maximum player count and lives/mode
            const roomQuery = `SELECT player_count, lives, game_mode FROM games WHERE room_code = $1`;
            const roomResult = await this.db.query(roomQuery, [roomCode]);

            if (roomResult.rows.length === 0) {
                res.status(404).json({ error: 'Room does not exist' });
                return;
            }

            // Validate if the room has reached the maximum number of players
            const maxPlayers = roomResult.rows[0].player_count;
            const initialLives = roomResult.rows[0].lives || 3;
            // const gameMode = roomResult.rows[0].game_mode; // Not strictly needed for logic unless we suppress lives for co-op logic here, but standard is uniform.

            const userCountQuery = `SELECT COUNT(*) AS user_count FROM players WHERE room_code = $1`;
            const userCountResult = await this.db.query(userCountQuery, [roomCode]);

            const currentUserCount = parseInt(userCountResult.rows[0].user_count, 10);
            if (currentUserCount >= maxPlayers) {
                res.status(403).json({ error: 'Room is full' });
                return;
            }

            let player;

            if (userId) {
                console.log('Attempting to fetch existing player with userId:', userId);
                const query = `SELECT * FROM players WHERE userId = $1 AND room_code = $2`;
                const result = await this.db.query(query, [userId, roomCode]);

                if (result.rows.length > 0) {
                    player = result.rows[0];
                } else {
                    console.warn('Provided userId does not exist in the room. Creating a new player.');
                }
            }

            if (!player) {
                // Use provided userId if available, otherwise generate a new guest ID
                const newUserId = userId || `user_${Math.random().toString(36).substring(2, 10)}`;
                console.log('Creating new player with userId:', newUserId);

                // Start Transaction to ensure cleanup and insert happen atomically? Not strictly necessary but good practice.
                // For now, just DELETE before INSERT to fix the unique constraint violation.
                // If a user is joining a new room, they leave the old one.
                await this.db.query('DELETE FROM players WHERE userId = $1', [newUserId]);

                // Fix: Initialize lives from Game Settings
                const insertQuery = `INSERT INTO players (userId, room_code, name, lives) VALUES ($1, $2, $3, $4) RETURNING *`;
                const values = [newUserId, roomCode, userName, initialLives];
                const insertResult = await this.db.query(insertQuery, values);
                player = insertResult.rows[0];
            }

            console.log('Player successfully joined:', player);

            // Keep user_count in sync (join path)
            await this.db.query(
                `UPDATE games SET user_count = (SELECT COUNT(*) FROM players WHERE room_code = $1) WHERE room_code = $1`,
                [roomCode]
            );

            // Auto-start Logic
            if (currentUserCount + 1 >= maxPlayers) {
                console.log(`Room ${roomCode} is full. Attempting auto-start.`);
                this.tryAutoStart(roomCode).catch(e => console.error('Auto-start failed:', e));
            }

            res.status(200).json({ userId: player.userid });
        } catch (err) {
            console.error('Error in joinGame method:', err);
            const error = err as Error;
            if (error.message.includes('duplicate key value')) {
                res.status(409).json({ error: 'Player name already exists in this room. Please choose a different name.' });
            } else {
                res.status(500).json({ error: 'Failed to join game due to server error' });
            }
        }
    }

    // Helper for Auto-Start
    private async tryAutoStart(roomCode: string): Promise<void> {
        try {
            const gameCheckQuery = 'SELECT game_id, status, selected_categories, difficulty_mode, player_count, lives, wait_time FROM games WHERE room_code = $1';
            const gameCheckResult = await this.db.query(gameCheckQuery, [roomCode]);

            if (gameCheckResult.rows.length === 0) return;
            const game = gameCheckResult.rows[0];
            if (game.status !== 'pending') return;

            const categories = game.selected_categories || null;
            const difficultyMode = game.difficulty_mode || 'standard';
            const firstQuestion = await this.questionModel.getQuestionByLevel(1, [], categories, difficultyMode);

            if (!firstQuestion) {
                console.error('Auto-start: No question found.');
                return;
            }

            const questionId = firstQuestion.question_id || firstQuestion.id;

            await this.db.query(`
                UPDATE games
                SET status = 'started', current_level = 1, current_question_id = $1, last_active = CURRENT_TIMESTAMP
                WHERE room_code = $2
            `, [questionId, roomCode]);

            const options = this.getConsistentOptions(
                questionId,
                [...(firstQuestion.incorrect_answers || []), firstQuestion.correct_answer],
                firstQuestion.translations
            );

            const questionTranslations: Record<string, string> = {};
            if (firstQuestion.translations) {
                for (const [lang, data] of Object.entries(firstQuestion.translations) as [string, any][]) {
                    questionTranslations[lang] = data.question;
                }
            }

            const questionData = {
                id: questionId,
                category: firstQuestion.category,
                difficulty: firstQuestion.difficulty,
                question: firstQuestion.question,
                questionTranslations: questionTranslations,
                level: 1,
                prize: getPrizeForLevel(1),
                options: options,
                answerDeadline: Date.now() + GameController.QUESTION_TIMEOUT_MS
            };

            this.io.to(roomCode).emit('gameStarted', { message: 'Game Auto-Started! Room Full.' });

            setTimeout(() => {
                this.io.to(roomCode).emit('newQuestion', questionData);
                // Arm the round timer when the first question is actually broadcast
                this.startRoundTimer(roomCode, game.game_id, 1, game.wait_time ?? 15, firstQuestion.correct_answer, game.player_count ?? 10, game.lives ?? 3);
            }, 2000);

        } catch (error) {
            console.error('Error in tryAutoStart:', error);
        }
    }



    public async startGame(req: Request, res: Response): Promise<void> {
        let firstQuestion: any = null; // Declare firstQuestion here to make it accessible in the broader scope
        let hostId: any = null; // Declare hostId here to make it accessible after the transaction
        let gameStartConfig: { gameId: number; playerCount: number; lives: number; waitTimeInfo: number } | null = null;
        const { roomCode } = req.params;
        const requestingUserId = (req as any).user?.userId ?? req.body?.userId;
        console.log('startGame method invoked with roomCode:', roomCode);

        if (!roomCode) {
            console.error('startGame: Room code is missing in the request parameters.');
            res.status(400).json({ error: 'Room code is required in URL path' });
            return;
        }

        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            const gameCheckQuery = 'SELECT game_id, status, selected_categories, difficulty_mode, host_id, player_count, lives, wait_time FROM games WHERE room_code = $1';
            const gameCheckResult = await client.query(gameCheckQuery, [roomCode]);

            if (gameCheckResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'Game not found with the provided room code' });
                return;
            }

            const game = gameCheckResult.rows[0];
            hostId = game.host_id;
            gameStartConfig = {
                gameId: game.game_id,
                playerCount: game.player_count ?? 10,
                lives: game.lives ?? 3,
                waitTimeInfo: game.wait_time ?? 15,
            };

            // Only the host may start the game (guest-hosted rooms stay open)
            if (hostId !== null && hostId !== undefined
                && (requestingUserId === undefined || String(hostId) !== String(requestingUserId))) {
                await client.query('ROLLBACK');
                res.status(403).json({ error: 'Only the host can start the game.' });
                return;
            }

            if (game.status !== 'pending') {
                await client.query('ROLLBACK');
                res.status(409).json({
                    error: `Game cannot be started. Current status: ${game.status}`,
                    currentStatus: game.status
                });
                return;
            }

            console.log('startGame: Fetching the first question for level 1.');
            const categories = game.selected_categories || null;
            const difficultyMode = game.difficulty_mode || 'standard';
            firstQuestion = await this.questionModel.getQuestionByLevel(1, [], categories, difficultyMode); // Assign to the outer scoped firstQuestion

            if (!firstQuestion) {
                await client.query('ROLLBACK');
                console.error('startGame: Failed to fetch the first question.');
                res.status(500).json({ error: 'Failed to fetch the first question. Check question pool.' });
                return;
            }

            console.log('startGame: First question fetched successfully:', firstQuestion.question_id || firstQuestion.id, firstQuestion.question);

            // Ensure we have a consistent question ID by preferring question_id, falling back to id
            const questionIdForDb = firstQuestion.question_id || firstQuestion.id;
            console.log(`startGame: Using question ID ${questionIdForDb} from the fetched question for DB update`);

            // Update game status to 'started', set current level to 1, and set the first question ID in one operation
            const updateQuery = `
                UPDATE games
                SET status = 'started', current_level = 1, current_question_id = $1, last_active = CURRENT_TIMESTAMP
                WHERE room_code = $2
                RETURNING game_id
            `;
            const updateResult = await client.query(updateQuery, [questionIdForDb, roomCode]);

            if (updateResult.rowCount === 0) {
                await client.query('ROLLBACK');
                console.error('startGame: Game not found or could not be updated.');
                res.status(500).json({ error: 'Game could not be updated' });
                return;
            }

            await client.query('COMMIT');
            console.log('startGame: Game status updated successfully. Database transaction committed.');

        } catch (error) {
            await client.query('ROLLBACK');
            client.release(); // Release client in case of error before finally
            console.error('startGame: Error during database transaction:', error);
            // It's important to send a response here or rethrow if a higher-level handler will send it
            res.status(500).json({ error: 'Failed to start game due to database error' });
            return; // Ensure no further code in startGame executes if DB part fails
        } finally {
            client.release();
        }

        // After successful DB update, firstQuestion should be populated.
        // The check for !firstQuestion below will handle if it wasn't successfully fetched and assigned.

        if (!this.io) {
            console.error('startGame: io instance is not initialized. Cannot broadcast events.');
            res.status(500).json({ error: 'Internal server error: WebSocket instance not initialized.' });
            return;
        }

        // Use the 'firstQuestion' variable from above, not a new fetch
        if (!firstQuestion) { // This check is technically redundant if the above logic is sound, but safe
            console.error('startGame: firstQuestion is unexpectedly null after DB commit.');
            res.status(500).json({ error: 'Game started but failed to prepare question data due to internal error.' });
            return;
        }

        const questionIdForSocket = firstQuestion.question_id || firstQuestion.id; // Same ID as used for DB

        const options = this.getConsistentOptions(
            questionIdForSocket,
            [...(firstQuestion.incorrect_answers || []), firstQuestion.correct_answer],
            firstQuestion.translations
        );

        const questionTranslations: Record<string, string> = {};
        if (firstQuestion.translations) {
            for (const [lang, data] of Object.entries(firstQuestion.translations) as [string, any][]) {
                questionTranslations[lang] = data.question;
            }
        }

        const questionToSendToSocket = {
            id: questionIdForSocket,
            category: firstQuestion.category,
            difficulty: firstQuestion.difficulty,
            question: firstQuestion.question,
            questionTranslations: questionTranslations, // Add translations
            level: 1, // current_level was set to 1
            prize: getPrizeForLevel(1), // Use the standalone function directly
            options: options,
            answerDeadline: Date.now() + GameController.QUESTION_TIMEOUT_MS
        };

        // Payload for the HTTP response to the host, including correct answer
        // (anti-cheat: only the host receives it)
        const isHost = hostId !== null && hostId !== undefined && requestingUserId !== undefined
            && String(hostId) === String(requestingUserId);
        const questionForHost = {
            ...questionToSendToSocket,
            correctAnswer: isHost ? firstQuestion.correct_answer : undefined
        };

        console.log('startGame: Broadcasting gameStarted event to room:', roomCode);
        this.io.to(roomCode).emit('gameStarted', { message: 'The game has started!' });

        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay

        console.log('startGame: Broadcasting newQuestion event to room:', roomCode, 'with question ID:', questionToSendToSocket.id);
        this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);

        // Arm the round timer as soon as the first question is broadcast
        if (gameStartConfig) {
            this.startRoundTimer(roomCode, gameStartConfig.gameId, 1, gameStartConfig.waitTimeInfo, firstQuestion.correct_answer, gameStartConfig.playerCount, gameStartConfig.lives);
        }

        res.status(200).json({
            message: 'Game started successfully',
            firstQuestion: questionForHost
        });

    }

    // ================= Timer management (pausable by host) =================

    private clearRoomTimer(roomCode: string): void {
        const entry = this.roomTimers.get(roomCode);
        if (entry?.timer) {
            clearTimeout(entry.timer);
        }
        this.roomTimers.delete(roomCode);
    }

    private startRoundTimer(roomCode: string, gameId: number, currentLevel: number, waitTimeInfo: number, correctAnswer: string, playerCount: number, lives: number): void {
        if (this.roomTimers.has(roomCode)) return; // one pending timer per room
        const entry: PendingTimer = {
            kind: 'round',
            remainingMs: GameController.QUESTION_TIMEOUT_MS,
            startedAt: Date.now(),
            gameId,
            currentLevel,
            waitTimeInfo,
            correctAnswer,
            playerCount,
            lives,
        };
        entry.timer = setTimeout(() => this.fireRoomTimer(roomCode), entry.remainingMs);
        this.roomTimers.set(roomCode, entry);
        console.log(`[RoundTimer] Started ${GameController.QUESTION_TIMEOUT_MS / 1000}s round timer for room ${roomCode} (level ${currentLevel}).`);
    }

    private startAdvanceTimer(roomCode: string, gameId: number, currentLevel: number, waitTimeInfo: number): void {
        this.clearRoomTimer(roomCode);
        const entry: PendingTimer = {
            kind: 'advance',
            remainingMs: waitTimeInfo * 1000,
            startedAt: Date.now(),
            gameId,
            currentLevel,
            waitTimeInfo,
        };
        entry.timer = setTimeout(() => this.fireRoomTimer(roomCode), entry.remainingMs);
        this.roomTimers.set(roomCode, entry);
        console.log(`[AdvanceTimer] Next question for room ${roomCode} in ${waitTimeInfo}s.`);
    }

    private fireRoomTimer(roomCode: string): void {
        const entry = this.roomTimers.get(roomCode);
        if (!entry) return;
        this.roomTimers.delete(roomCode);

        if (entry.kind === 'round') {
            this.forceResolveRound(roomCode, entry).catch(err => {
                console.error(`[RoundTimer] Force-resolve failed for room ${roomCode}:`, err);
            });
        } else {
            this.advanceToNextQuestion(roomCode, entry.gameId, entry.currentLevel).catch(err => {
                console.error(`[AdvanceTimer] Advance failed for room ${roomCode}:`, err);
            });
        }
    }

    private async forceResolveRound(roomCode: string, entry: PendingTimer): Promise<void> {
        console.log(`[RoundTimer] Timeout reached for room ${roomCode} — force resolving round.`);
        // Verify the round is still the current one
        const gameRes = await this.db.query(
            `SELECT current_question_id, status, game_mode FROM games WHERE room_code = $1`,
            [roomCode]
        );
        const game = gameRes.rows[0];
        if (!game || game.status !== 'started') return;

        if (game.game_mode === 'survival') {
            // Living players who did not answer lose a life (recorded as failed answer)
            const livingRes = await this.db.query(
                `SELECT userId FROM players WHERE room_code = $1 AND lives > 0`,
                [roomCode]
            );
            const answeredRes = await this.db.query(
                `SELECT DISTINCT user_id FROM player_answers WHERE question_id = $1 AND room_code = $2 AND level = $3`,
                [game.current_question_id, roomCode, entry.currentLevel]
            );
            const answeredSet = new Set(answeredRes.rows.map((r: any) => r.user_id));
            for (const p of livingRes.rows) {
                if (answeredSet.has(p.userid)) continue;
                console.log(`[RoundTimer] ${p.userid} did not answer — losing a life.`);
                await this.db.query(
                    `UPDATE players SET lives = GREATEST(lives - 1, 0) WHERE userId = $1 AND room_code = $2`,
                    [p.userid, roomCode]
                );
                await this.db.query(
                    `INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level, category)
                     VALUES ($1, $2, NULL, $3, $4, $5, NULL)`,
                    [p.userid, game.current_question_id, false, roomCode, entry.currentLevel]
                );
            }
            await this.resolveSurvivalRound(roomCode, entry.gameId, entry.currentLevel, entry.waitTimeInfo, entry.correctAnswer!);
        } else {
            await this.resolveCoopRound(roomCode, entry.gameId, entry.currentLevel, entry.waitTimeInfo, entry.correctAnswer!, entry.playerCount!, entry.lives!);
        }
    }

    private async resolveSurvivalRound(roomCode: string, gameId: number, currentLevel: number, waitTimeInfo: number, correctAnswer: string): Promise<void> {
        const gameRes = await this.db.query(
            `SELECT current_question_id FROM games WHERE room_code = $1`,
            [roomCode]
        );
        const questionId = gameRes.rows[0]?.current_question_id;
        if (!questionId) return;

        const allAnswersQuery = `
            SELECT p.name, p.userId, pa.answer, pa.is_correct, p.lives, p.score
            FROM player_answers pa
            JOIN players p ON pa.user_id = p.userId AND pa.room_code = p.room_code
            WHERE pa.question_id = $1 AND pa.room_code = $2 AND pa.level = $3
        `;
        const allAnswersResult = await this.db.query(allAnswersQuery, [questionId, roomCode, currentLevel]);

        const survivorsResult = await this.db.query(`SELECT userId FROM players WHERE room_code = $1 AND lives > 0`, [roomCode]);
        const survivors = survivorsResult.rows.map((r: any) => r.userId);
        const survivorCount = survivors.length;

        let gameEnded = false;
        let message = 'Round finished.';

        if (survivorCount === 0) {
            gameEnded = true;
            message = 'Game Over! No survivors.';
            await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
            await this.finalizeGameStats(roomCode, 'survival', 'loss', currentLevel);
        } else if (currentLevel >= 15) {
            gameEnded = true;
            message = 'Game Over! Victory!';
            await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
            await this.finalizeGameStats(roomCode, 'survival', 'win', currentLevel);
        }

        this.io.to(roomCode).emit('revealAnswers', {
            correctAnswer: correctAnswer,
            playerAnswers: allAnswersResult.rows,
            timeToNextQuestion: gameEnded ? waitTimeInfo + 30 : waitTimeInfo,
            currentLevel: currentLevel,
            gameEnded,
            gameMode: 'survival'
        });

        if (!gameEnded) {
            this.startAdvanceTimer(roomCode, gameId, currentLevel, waitTimeInfo);
        } else {
            const finalMessage = message === 'Game Over! Victory!' ? 'You won - Victory!' : message;
            setTimeout(() => {
                this.io.to(roomCode).emit('gameEnded', {
                    message: finalMessage,
                    winnerIds: survivors,
                    gameMode: 'survival'
                });
            }, (waitTimeInfo + 30) * 1000);
        }
    }

    private async resolveCoopRound(roomCode: string, gameId: number, currentLevel: number, waitTimeInfo: number, correctAnswer: string, playerCount: number, lives: number): Promise<void> {
        const gameRes = await this.db.query(
            `SELECT current_question_id, lives AS game_lives FROM games WHERE room_code = $1`,
            [roomCode]
        );
        const game = gameRes.rows[0];
        if (!game) return;
        const questionId = game.current_question_id;
        const currentLives = lives ?? game.game_lives ?? 3;

        // Determine Team Answer (Majority Vote; random tie-break on equal votes)
        const voteQuery = `
            SELECT answer, COUNT(*) as vote_count 
            FROM player_answers 
            WHERE question_id = $1 AND room_code = $2 AND level = $3 
            GROUP BY answer 
            ORDER BY vote_count DESC, RANDOM() 
            LIMIT 1
        `;
        const voteResult = await this.db.query(voteQuery, [questionId, roomCode, currentLevel]);
        const teamAnswer = voteResult.rows[0]?.answer ?? null;
        const isTeamCorrect = teamAnswer === correctAnswer;

        let gameEnded = false;
        let newLives = currentLives;

        const currentPrize = getPrizeForLevel(currentLevel);

        if (isTeamCorrect) {
            const updateScoreQuery = `UPDATE players SET score = $1 WHERE room_code = $2`;
            await this.db.query(updateScoreQuery, [currentPrize, roomCode]);

            if (currentLevel >= 15) {
                gameEnded = true;
                await this.db.query(`UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`, [gameId]);
                await this.finalizeGameStats(roomCode, 'cooperative', 'win', currentLevel);
            }
        } else {
            newLives = currentLives - 1;
            await this.db.query(`UPDATE games SET lives = $1, last_active = CURRENT_TIMESTAMP WHERE game_id = $2`, [newLives, gameId]);

            if (newLives <= 0) {
                gameEnded = true;
                await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
                await this.finalizeGameStats(roomCode, 'cooperative', 'loss', currentLevel);
            }
        }

        // Get all player answers for reveal
        const allAnswersQuery = `
            SELECT p.name, pa.answer, pa.is_correct 
            FROM player_answers pa
            JOIN players p ON pa.user_id = p.userId AND pa.room_code = p.room_code
            WHERE pa.question_id = $1 AND pa.room_code = $2 AND pa.level = $3
        `;
        const allAnswersResult = await this.db.query(allAnswersQuery, [questionId, roomCode, currentLevel]);

        // Mark room members who did not answer
        const answeredNames = new Set(allAnswersResult.rows.map((r: any) => r.name));
        const membersRes = await this.db.query(`SELECT name FROM players WHERE room_code = $1`, [roomCode]);
        const noAnswerRows = membersRes.rows
            .filter((m: any) => !answeredNames.has(m.name))
            .map((m: any) => ({ name: m.name, answer: 'No answer', is_correct: false }));
        const playerAnswers = [...allAnswersResult.rows, ...noAnswerRows];

        const revealPayload = {
            correctAnswer: correctAnswer,
            teamAnswer: teamAnswer,
            isTeamCorrect: isTeamCorrect,
            livesRemaining: newLives,
            playerAnswers: playerAnswers,
            timeToNextQuestion: gameEnded ? waitTimeInfo + 30 : waitTimeInfo,
            currentLevel: currentLevel,
            gameEnded: gameEnded,
            gameMode: 'cooperative'
        };

        this.io.to(roomCode).emit('revealAnswers', revealPayload);

        if (!gameEnded) {
            this.startAdvanceTimer(roomCode, gameId, currentLevel, waitTimeInfo);
        } else {
            setTimeout(() => {
                this.io.to(roomCode).emit('gameEnded', { message: isTeamCorrect ? 'You won - Victory!' : 'Game Over (Lives Depleted)' });
            }, (waitTimeInfo + 30) * 1000);
        }
    }

    public async submitAnswer(req: Request, res: Response): Promise<void> {
        try {
            const { roomCode } = req.params;
            const { userId, answer } = req.body;

            if (!roomCode || !userId || answer === undefined) {
                res.status(400).json({ error: 'Room code, user ID, and answer are required' });
                return;
            }

            // Get game state including game_mode and wait_time
            const gameQuery = `SELECT game_id, current_question_id, current_level, player_count, lives, game_mode, wait_time FROM games WHERE room_code = $1 AND status = 'started'`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Active game not found.' });
                return;
            }

            const { game_id: gameId, current_question_id, current_level, player_count, lives, game_mode, wait_time } = gameResult.rows[0];
            const waitTimeInfo = wait_time || 15; // Default to 15 if null

            if (!current_question_id) {
                res.status(409).json({ error: 'No active question.' });
                return;
            }

            // Membership check: only players of this room may submit answers
            const memberRes = await this.db.query(
                `SELECT 1 FROM players WHERE userId = $1 AND room_code = $2`,
                [userId, roomCode]
            );
            if (memberRes.rows.length === 0) {
                res.status(403).json({ error: 'You are not a member of this room.' });
                return;
            }

            // Security Check: Is the player allowed to answer?
            if (game_mode === 'survival') {
                const playerQuery = `SELECT lives FROM players WHERE userId = $1 AND room_code = $2`;
                const playerResult = await this.db.query(playerQuery, [userId, roomCode]);
                if (playerResult.rows.length === 0 || playerResult.rows[0].lives <= 0) {
                    res.status(403).json({ error: 'You have been eliminated and cannot vote.' });
                    return;
                }
            } else {
                // Cooperative: Check team lives
                if (lives <= 0) {
                    res.status(403).json({ error: 'Team has no lives remaining.' });
                    return;
                }
            }

            // Check existing answer
            const existingAnswerQuery = `SELECT * FROM player_answers WHERE user_id = $1 AND question_id = $2 AND room_code = $3 AND level = $4`;
            const existingAnswerResult = await this.db.query(existingAnswerQuery, [userId, current_question_id, roomCode, current_level]);

            if (existingAnswerResult.rows.length > 0) {
                res.status(403).json({ error: 'Already answered.', alreadyAnswered: true });
                return;
            }

            // Get Correct Answer AND Category
            const questionQuery = `SELECT correct_answer, category FROM questions WHERE id = $1`;
            const questionResult = await this.db.query(questionQuery, [current_question_id]);
            const { correct_answer, category } = questionResult.rows[0];
            const isIndividualCorrect = answer === correct_answer;

            // --- SURVIVAL MODE LOGIC ---
            if (game_mode === 'survival') {
                // 1. Update stats IMMEDIATELY
                if (isIndividualCorrect) {
                    const prizeAmount = getPrizeForLevel(current_level);
                    await this.db.query(`UPDATE players SET score = $1 WHERE userId = $2`, [prizeAmount, userId]);
                } else {
                    await this.db.query(`UPDATE players SET lives = GREATEST(lives - 1, 0) WHERE userId = $1`, [userId]);
                }

                // 2. Record Answer
                await this.db.query(
                    `INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level, category) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [userId, current_question_id, answer, isIndividualCorrect, roomCode, current_level, category]
                );

                // 3. Check for completion (All living players answered)
                const livingPlayersQuery = `SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND lives > 0`;
                const livingPlayersResult = await this.db.query(livingPlayersQuery, [roomCode]);
                const livingPlayerCount = parseInt(livingPlayersResult.rows[0].count, 10);

                const answersQuery = `
                    SELECT COUNT(DISTINCT pa.user_id) as count 
                    FROM player_answers pa
                    JOIN players p ON pa.user_id = p.userId
                    WHERE pa.question_id = $1 AND p.room_code = $2 AND p.lives > 0
                `;
                const answersResult = await this.db.query(answersQuery, [current_question_id, roomCode]);
                const answersCount = parseInt(answersResult.rows[0].count, 10);

                // If everyone alive has answered (or everyone is dead and we are resolving the final answers)
                if (answersCount >= livingPlayerCount) {
                    // RESOLVE ROUND
                    this.clearRoomTimer(roomCode);
                    await this.resolveSurvivalRound(roomCode, gameId, current_level, waitTimeInfo, correct_answer);
                    res.status(200).json({ message: 'All answers received.', waiting: false });

                } else {
                    // Waiting for others — arm a round timeout so the round cannot hang
                    this.startRoundTimer(roomCode, gameId, current_level, waitTimeInfo, correct_answer, player_count, lives);
                    this.io.to(roomCode).emit('playerAnswered', { count: answersCount, total: livingPlayerCount });
                    res.status(200).json({ message: 'Answer recorded. Waiting for other players.', waiting: true });
                }

                return;
            }

            // --- COOPERATIVE MODE LOGIC (As Before) ---

            // Record answer (temporarily mark is_correct based on individual, but game logic uses voting)
            const recordAnswerQuery = `
                INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            await this.db.query(recordAnswerQuery, [userId, current_question_id, answer, isIndividualCorrect, roomCode, current_level, category]);

            // Check if all players have answered
            const countQuery = `SELECT COUNT(*) as count FROM player_answers WHERE question_id = $1 AND room_code = $2 AND level = $3`;
            const countResult = await this.db.query(countQuery, [current_question_id, roomCode, current_level]);
            const answersCount = parseInt(countResult.rows[0].count, 10);

            if (answersCount < player_count) {
                // Not everyone answered yet — arm a round timeout so the round cannot hang
                this.startRoundTimer(roomCode, gameId, current_level, waitTimeInfo, correct_answer, player_count, lives);
                this.io.to(roomCode).emit('playerAnswered', { count: answersCount, total: player_count });
                res.status(200).json({ message: 'Answer recorded. Waiting for teammates.', waiting: true });
                return;
            }

            // --- ALL PLAYERS ANSWERED: RESOLVE ROUND ---
            this.clearRoomTimer(roomCode);
            await this.resolveCoopRound(roomCode, gameId, current_level, waitTimeInfo, correct_answer, player_count, lives);

            res.status(200).json({ message: 'Round resolved', waiting: false });

        } catch (error) {
            console.error('Error handling answer:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    public async useJoker(req: Request, res: Response): Promise<void> {
        try {
            const { roomCode } = req.params;
            const { userId, jokerType } = req.body;

            if (!roomCode || !userId || !jokerType) {
                res.status(400).json({ error: 'Missing required parameters.' });
                return;
            }

            // Get game state
            const gameQuery = `SELECT game_id, current_question_id, game_mode, jokers_used as team_jokers, jokers_5050_removed as team_5050_removed FROM games WHERE room_code = $1 AND status = 'started'`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Active game not found.' });
                return;
            }

            const { game_id, current_question_id, game_mode, team_jokers, team_5050_removed } = gameResult.rows[0];

            if (!current_question_id) {
                res.status(409).json({ error: 'No active question.' });
                return;
            }

            // Check if joker used
            console.log(`[useJoker] User: ${userId}, Type: ${jokerType}, Mode: ${game_mode}`);

            let player5050Removals: string[] = [];

            if (game_mode === 'cooperative') {
                const used = team_jokers || [];
                console.log(`[useJoker] Team Jokers Used: ${JSON.stringify(used)}`);
                if (used.includes(jokerType)) {
                    console.warn(`[useJoker] REJECT: Joker ${jokerType} already used by team.`);
                    res.status(403).json({ error: 'Joker already used by team.' });
                    return;
                }
            } else {
                // Survival
                // FIXED: players.game_id is never populated — lookup by room_code
                // (unique via UNIQUE(userId, room_code)) instead of game_id
                const playerQuery = `SELECT jokers_used, jokers_5050_removed FROM players WHERE userId = $1 AND room_code = $2`;
                const playerResult = await this.db.query(playerQuery, [userId, roomCode]);
                if (playerResult.rows.length === 0) {
                    res.status(404).json({ error: 'Player not found in this game.' });
                    return;
                }
                const playerJokers = playerResult.rows[0].jokers_used || [];
                console.log(`[useJoker] Player Jokers Used (${userId}): ${JSON.stringify(playerJokers)}`);

                if (playerJokers.includes(jokerType)) {
                    console.warn(`[useJoker] REJECT: Joker ${jokerType} already used by player.`);
                    res.status(403).json({ error: 'You have already used this joker.' });
                    return;
                }
                player5050Removals = playerResult.rows[0].jokers_5050_removed || [];
            }

            // 50:50 removals (for chained audience/phone jokers on the same question)
            const stored5050Removals: string[] = game_mode === 'cooperative'
                ? (team_5050_removed || [])
                : player5050Removals;

            // Fetch Question Data
            const questionQuery = `SELECT * FROM questions WHERE id = $1`;
            const questionResult = await this.db.query(questionQuery, [current_question_id]);
            const question = questionResult.rows[0];

            let payload: any = {};

            // LOGIC BY TYPE
            if (jokerType === '5050') {
                // Return 2 incorrect answers
                const incorrect = [...question.incorrect_answers];
                const shuffledIncorrect = incorrect.sort(() => 0.5 - Math.random());
                const toRemove = shuffledIncorrect.slice(0, 2);
                payload = {
                    wrongAnswersToRemove: toRemove
                };
                // Store removals so chained audience/phone jokers only see the
                // two remaining options (cleared on the next question)
                if (game_mode === 'cooperative') {
                    await this.db.query(`UPDATE games SET jokers_5050_removed = $1 WHERE game_id = $2`, [toRemove, game_id]);
                } else {
                    await this.db.query(`UPDATE players SET jokers_5050_removed = $1 WHERE userId = $2 AND room_code = $3`, [toRemove, userId, roomCode]);
                }
            } else if (jokerType === 'audience') {
                // Simulate Audience
                const difficulty = question.difficulty;
                let reliability = 1.0; // x: Chance the audience is "right" (majority)
                let minVote = 80;      // y: Min % for correct answer if reliable

                if (difficulty === 'medium') {
                    reliability = 0.9;
                    minVote = 70;
                } else if (difficulty === 'hard') {
                    reliability = 0.75;
                    minVote = 60;
                } else if (difficulty === 'very_hard') {
                    reliability = 0.6;
                    minVote = 51;
                }

                const allOptions = this.getConsistentOptions(
                    question.id,
                    [...question.incorrect_answers, question.correct_answer],
                    question.translations
                );
                // If 50:50 was used on this question, only the 2 remaining options poll
                const activeRemovals = stored5050Removals.filter((r: string) => allOptions.some((o: any) => o.text === r));
                const options = activeRemovals.length > 0
                    ? allOptions.filter((o: any) => !activeRemovals.includes(o.text))
                    : allOptions;

                const stats: Record<string, number> = {};
                let remaining = 100;

                // Probability roll
                const isReliable = Math.random() < reliability;
                let correctVote = 0;

                if (isReliable) {
                    // Correct answer gets between y% (minVote) and 95%
                    correctVote = Math.floor(Math.random() * (95 - minVote + 1)) + minVote;
                } else {
                    // Audience is wrong/confused: Correct answer gets 0-40%
                    correctVote = Math.floor(Math.random() * 41);
                }

                // Assign votes
                options.forEach((opt: any) => {
                    if (opt.text === question.correct_answer) {
                        stats[opt.text] = correctVote;
                        remaining -= correctVote;
                    } else {
                        stats[opt.text] = 0; // Init
                    }
                });

                // Distribute remaining votes among incorrect options
                const otherOptions = options.filter((o: any) => o.text !== question.correct_answer);

                // Shuffle other options to distribute votes randomly, avoiding visible patterns
                // (e.g., first incorrect option always getting the bulk of the remainder)
                for (let i = otherOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [otherOptions[i], otherOptions[j]] = [otherOptions[j], otherOptions[i]];
                }

                otherOptions.forEach((opt: any, idx: number) => {
                    if (idx === otherOptions.length - 1) {
                        // Last option gets all remaining
                        stats[opt.text] = remaining;
                    } else {
                        // Give a random chunk of the remaining
                        const val = Math.floor(Math.random() * (remaining + 1));
                        stats[opt.text] = val;
                        remaining -= val;
                    }
                });

                payload = { stats };

            } else if (jokerType === 'phone') {
                const difficulty = question.difficulty;
                const hit = Math.random();
                let isCorrect = false;

                // Heuristic for friend correctness
                // Easy: 90%, Medium: 70%, Hard: 55%, Very Hard: 40%
                if (difficulty === 'easy' && hit > 0.1) isCorrect = true;
                else if (difficulty === 'medium' && hit > 0.3) isCorrect = true;
                else if (difficulty === 'hard' && hit > 0.45) isCorrect = true;
                else if (difficulty === 'very_hard' && hit > 0.6) isCorrect = true;

                // If 50:50 was used, the friend can only choose from the 2 remaining options
                let wrongOption = question.incorrect_answers[0];
                if (stored5050Removals.length > 0) {
                    const allOptions = this.getConsistentOptions(
                        question.id,
                        [...question.incorrect_answers, question.correct_answer],
                        question.translations
                    );
                    const activeRemovals = stored5050Removals.filter((r: string) => allOptions.some((o: any) => o.text === r));
                    const remainingOptions = allOptions.filter((o: any) => !activeRemovals.includes(o.text));
                    const wrong = remainingOptions.find((o: any) => o.text !== question.correct_answer);
                    if (wrong) wrongOption = wrong.text;
                }

                payload = {
                    message: isCorrect
                        ? `I'm pretty sure it's "${question.correct_answer}".`
                        : `I'm not sure, maybe "${wrongOption}"?`
                };
            }

            // MARK AS USED
            if (game_mode === 'cooperative') {
                await this.db.query(`UPDATE games SET jokers_used = array_append(jokers_used, $1) WHERE game_id = $2`, [jokerType, game_id]);
                // Broadcast to update all clients that team joker is used
                this.io.to(roomCode).emit('jokerUsed', { jokerType, userId: 'TEAM' });
            } else {
                await this.db.query(`UPDATE players SET jokers_used = array_append(jokers_used, $1) WHERE userId = $2 AND room_code = $3`, [jokerType, userId, roomCode]);
                // Emit event so frontend plays audio and updates UI if needed
                this.io.to(roomCode).emit('jokerUsed', { jokerType, userId });
            }

            res.status(200).json({ ...payload, jokerType });

        } catch (error) {
            console.error('Error using joker:', error);
            res.status(500).json({ error: 'Server error using joker' });
        }
    }

    public async getQuestions(req: Request, res: Response): Promise<void> {
        try {
            // Anti-cheat: the full question bank (incl. answers) must not be public.
            // Admin password matches the /api/admin pattern.
            const password = req.query.password || req.body?.password;
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
            if (password !== adminPassword) {
                res.status(401).json({ error: 'Unauthorized: Invalid password' });
                return;
            }

            console.log('Fetching questions...');
            const questions = await this.questionModel.find();
            console.log(`Questions fetched: ${questions.length} questions`); // Log count instead of full data
            res.status(200).json(questions);
        } catch (error) {
            console.error('Error fetching questions:', error);
            res.status(500).json({ error: 'Failed to fetch questions due to server error' });
        }
    }

    public async getGameById(req: Request, res: Response): Promise<void> {
        console.log(`[getGameById] Received request for ID: ${req.params.id}`); // Log incoming ID
        try {
            const { id } = req.params; // This can be either game_id or room_code

            // Determine if the id is numeric (game_id) or alphanumeric (room_code)
            const isNumericId = !isNaN(Number(id));
            console.log(`[getGameById] ID '${id}' is ${isNumericId ? 'numeric (game_id)' : 'alphanumeric (room_code)'}`); // Log ID type

            // Fetch game details — try room_code FIRST (room codes may be purely
            // numeric, e.g. "123456", which would otherwise be mistaken for a game_id)
            let gameResult = await this.db.query(`SELECT * FROM games WHERE room_code = $1`, [id]);
            if (gameResult.rows.length === 0 && isNumericId) {
                gameResult = await this.db.query(`SELECT * FROM games WHERE game_id = $1`, [id]);
            }
            console.log(`[getGameById] Game query result count: ${gameResult.rows.length}`); // Log query result

            if (gameResult.rows.length === 0) {
                console.log(`[getGameById] Game not found for ID: ${id}`); // Log not found
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            const game = gameResult.rows[0];
            console.log(`[getGameById] Found game:`, game); // Log found game data

            // Fetch players associated with the game using room_code
            // Fetch players associated with the game using room_code (Sanitized: NO userId)
            const playersQuery = `SELECT name, score, lives, jokers_used FROM players WHERE room_code = $1`;
            const playersResult = await this.db.query(playersQuery, [game.room_code]);
            const players = playersResult.rows;
            console.log(`[getGameById] Found players for room ${game.room_code}:`, players); // Log found players

            // Remove fetching questions from game_questions table
            // const questionsQuery = `
            //     SELECT q.question_id AS id, q.category, q.difficulty, q.question, q.correct_answer, q.incorrect_answers
            //     FROM game_questions gq
            //     JOIN questions q ON gq.question_id = q.question_id
            //     WHERE gq.game_id = $1
            // `;
            // const questionsResult = await this.db.query(questionsQuery, [game.game_id]);
            // const questions = questionsResult.rows;

            const responseData = {
                ...game,
                players,
            };
            console.log(`[getGameById] Sending response data for ID ${id}:`, responseData); // Log response data
            res.status(200).json(responseData);
        } catch (error) {
            console.error(`[getGameById] Error fetching game by ID ${req.params.id}:`, error); // Log error
            res.status(500).json({ error: 'Failed to fetch game by ID due to server error' });
        }
    }

    // Add getPlayers method explicitly if it was missing or needing update
    public async getPlayers(req: Request, res: Response): Promise<void> {
        try {
            const { roomCode } = req.params;
            if (!roomCode) {
                res.status(400).json({ error: 'Room code is required' });
                return;
            }

            // Return userId and avatar_url by joining with users table
            // CAST users.id to TEXT to compare with players.userId (VARCHAR)
            const query = `
                SELECT p.name, p.score, p.lives, p.jokers_used, p.userId, u.avatar_url 
                FROM players p
                LEFT JOIN users u ON p.userId = CAST(u.id AS VARCHAR)
                WHERE p.room_code = $1 
                ORDER BY p.score DESC
            `;
            const result = await this.db.query(query, [roomCode]);
            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching players:', error);
            res.status(500).json({ error: 'Failed to fetch players' });
        }
    }

    // Method to fetch the current question for a game
    public async getCurrentQuestion(req: Request, res: Response): Promise<void> {
        try {
            const { roomCode } = req.params; // Assuming roomCode is passed as a URL parameter
            if (!roomCode) {
                res.status(400).json({ error: 'Room code is required' });
                return;
            }

            const userId = req.query.userId as string || null;

            // Fetch the current game info using roomCode
            const gameQuery = `SELECT current_question_id, current_level, status, selected_categories, host_id FROM games WHERE room_code = $1`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            const { current_question_id, current_level, status, selected_categories, host_id } = gameResult.rows[0];

            // Only the host may see the correct answer (anti-cheat).
            // Host identity is derived from the JWT ONLY — the userId query param
            // is client-controlled and must not grant host privileges.
            const authedUserId = (req as any).user?.userId;
            const isHost = authedUserId !== undefined && host_id !== null && host_id !== undefined
                && String(host_id) === String(authedUserId);

            // Handle non-active game states
            if (status === 'pending') {
                res.status(200).json({ message: 'Game is pending and has not started yet.', status, question: null, options: [] });
                return;
            }

            if (status === 'ended') {
                res.status(200).json({ message: 'Game has ended.', status, question: null, options: [] });
                return;
            }

            // Check if the user has already answered this question (if userId is provided)
            let userHasAnswered = false;
            let userAnswer = null;
            if (userId && current_question_id) {
                const answerQuery = `SELECT answer, is_correct FROM player_answers WHERE user_id = $1 AND question_id = $2`;
                const answerResult = await this.db.query(answerQuery, [userId, current_question_id]);

                if (answerResult.rows.length > 0) {
                    userHasAnswered = true;
                    userAnswer = answerResult.rows[0];
                }
            }

            // SIMPLIFIED HANDLING: Handle case when game is started but no question is set
            if (!current_question_id && status === 'started') {
                console.log('getCurrentQuestion: Game is started but current_question_id is null. Assigning a new question.');

                try {
                    // Select a question for the current level
                    const newQuestion = await this.questionModel.getQuestionByLevel(current_level || 1, [], selected_categories);

                    if (!newQuestion) {
                        console.error(`getCurrentQuestion: Failed to fetch question for level ${current_level || 1}`);
                        res.status(200).json({
                            message: `No questions available for level ${current_level || 1}. Please contact the game administrator.`,
                            status,
                            error: true,
                            question: null,
                            options: []
                        });
                        return;
                    }

                    // Use a consistent question ID
                    const questionId = newQuestion.question_id || newQuestion.id;

                    // Update the game with the new question ID
                    await this.db.query(
                        `UPDATE games SET current_question_id = $1 WHERE room_code = $2`,
                        [questionId, roomCode]
                    );

                    // Get consistent options for this question
                    const options = this.getConsistentOptions(
                        questionId,
                        [...newQuestion.incorrect_answers, newQuestion.correct_answer],
                        newQuestion.translations
                    );

                    const questionTranslations: Record<string, string> = {};
                    if (newQuestion.translations) {
                        for (const [lang, data] of Object.entries(newQuestion.translations) as [string, any][]) {
                            questionTranslations[lang] = data.question;
                        }
                    }

                    const questionToSend = {
                        id: questionId,
                        category: newQuestion.category,
                        difficulty: newQuestion.difficulty,
                        question: newQuestion.question,
                        questionTranslations: questionTranslations,
                        level: current_level || 1,
                        prize: getPrizeForLevel(current_level || 1),
                        options: options,
                        correctAnswer: isHost ? newQuestion.correct_answer : undefined,
                        status: status,
                        userHasAnswered: false,
                        userAnswer: null,
                        isCorrect: null
                    };

                    console.log('getCurrentQuestion: Assigned new question:', questionToSend);
                    res.status(200).json(questionToSend);
                    return;
                } catch (error) {
                    console.error('Error retrieving question for level:', error);
                    res.status(500).json({
                        message: 'Error retrieving question. Please try refreshing or contact the administrator.',
                        status,
                        error: true
                    });
                    return;
                }
            }

            // Standard flow when current_question_id is available
            const question = await this.questionModel.getQuestionById(current_question_id);

            if (!question) {
                console.error(`Question with ID ${current_question_id} not found. Trying to recover with a new question.`);

                // Try to recover by getting a new question for the current level
                const newQuestion = await this.questionModel.getQuestionByLevel(current_level || 1, [], selected_categories);
                if (!newQuestion) {
                    res.status(404).json({ error: 'Current question not found and unable to retrieve a replacement.' });
                    return;
                }

                // Update the game with the new question
                const questionId = newQuestion.question_id || newQuestion.id;
                await this.db.query(
                    `UPDATE games SET current_question_id = $1 WHERE room_code = $2`,
                    [questionId, roomCode]
                );

                // Continue with the new question
                const options = this.getConsistentOptions(
                    questionId,
                    [...newQuestion.incorrect_answers, newQuestion.correct_answer],
                    newQuestion.translations
                );

                const questionTranslations: Record<string, string> = {};
                if (newQuestion.translations) {
                    for (const [lang, data] of Object.entries(newQuestion.translations) as [string, any][]) {
                        questionTranslations[lang] = data.question;
                    }
                }

                const recoveredQuestion = {
                    id: questionId,
                    category: newQuestion.category,
                    difficulty: newQuestion.difficulty,
                    question: newQuestion.question,
                    questionTranslations: questionTranslations,
                    level: current_level,
                    prize: getPrizeForLevel(current_level),
                    options: options,
                    correctAnswer: isHost ? newQuestion.correct_answer : undefined,
                    status: status,
                    userHasAnswered: userHasAnswered,
                    userAnswer: userAnswer ? userAnswer.answer : null,
                    isCorrect: userAnswer ? userAnswer.is_correct : null,
                    recovered: true
                };

                res.status(200).json(recoveredQuestion);
                return;
            }

            // Get consistent options order based on question ID
            const options = this.getConsistentOptions(
                question.id,
                [...question.incorrect_answers, question.correct_answer],
                question.translations
            );

            const questionTranslations: Record<string, string> = {};
            if (question.translations) {
                for (const [lang, data] of Object.entries(question.translations) as [string, any][]) {
                    questionTranslations[lang] = data.question;
                }
            }

            const questionToSend = {
                id: question.id,
                category: question.category,
                difficulty: question.difficulty,
                question: question.question,
                questionTranslations: questionTranslations,
                level: current_level,
                prize: getPrizeForLevel(current_level),
                options: options,
                correctAnswer: isHost ? question.correct_answer : undefined,
                status: status,
                userHasAnswered: userHasAnswered,
                userAnswer: userAnswer ? userAnswer.answer : null,
                isCorrect: userAnswer ? userAnswer.is_correct : null
            };

            console.log('getCurrentQuestion: Sending question payload:', questionToSend);
            res.status(200).json(questionToSend);

        } catch (error) {
            console.error('Error fetching current question:', error);
            res.status(500).json({ error: 'Failed to fetch current question due to server error' });
        }
    }

    public async handleAnswer(req: Request, res: Response): Promise<void> {
        return this.submitAnswer(req, res);
    }


    public async getActiveGames(req: Request, res: Response): Promise<void> {
        try {
            const query = `SELECT room_code, name, status, last_active FROM games WHERE status != 'ended'`;
            const result = await this.db.query(query);

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'No active games found.' });
                return;
            }

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching active games:', error);
            res.status(500).json({ error: 'Failed to fetch active games due to server error' });
        }
    }

    public async getGameState(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Fetch game details
            const gameQuery = `SELECT * FROM games WHERE game_id = $1`;
            const gameResult = await this.db.query(gameQuery, [id]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            const game = gameResult.rows[0];

            // Fetch players associated with the game
            // Fetch players associated with the game (Sanitized: NO userId)
            const playersQuery = `SELECT name, score, lives, jokers_used FROM players WHERE room_code = $1`;
            const playersResult = await this.db.query(playersQuery, [game.room_code]);
            const players = playersResult.rows;

            res.status(200).json({
                ...game,
                players,
            });
        } catch (error) {
            console.error('Error fetching game state:', error);
            res.status(500).json({ error: 'Failed to fetch game state due to server error' });
        }
    }

    // Simpler method to get a question without complex fallback logic
    private async getQuestionForLevel(level: number): Promise<any> {
        try {
            console.log(`Attempting to get question for level ${level}`);
            const question = await this.questionModel.getQuestionByLevel(level);

            if (question && question.id) {
                console.log(`Successfully got question for level ${level}, ID: ${question.id}`);
                return question;
            }

            // If we reach here, no question found for that level
            console.error(`No question found for level ${level}`);
            return null;
        } catch (error) {
            console.error('Error in getQuestionForLevel:', error);
            return null;
        }
    }
}
