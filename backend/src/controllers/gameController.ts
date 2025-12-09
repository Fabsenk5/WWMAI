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

export class GameController {
    private questionModel: QuestionModel;
    private db: Pool;
    private io: SocketIOServer; // Add io property
    private aiService: AiService;

    // Helper method to advance to the next question
    private async advanceToNextQuestion(roomCode: string, gameId: number, currentLevel: number): Promise<void> {
        try {
            console.log(`Advancing game in room ${roomCode} from level ${currentLevel} to ${currentLevel + 1}`);

            // Check if it was the last level
            if (currentLevel >= 15) {
                console.log(`Game in room ${roomCode} has reached the maximum level. Ending game.`);

                // Update game status to 'ended'
                const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                await this.db.query(endGameQuery, [gameId]);

                // Emit gameEnded event
                this.io.to(roomCode).emit('gameEnded', { message: 'Game has ended. Maximum level reached.' });
                return;
            }

            // Fetch used question IDs to prevent duplicates
            const usedQuestionsQuery = `SELECT DISTINCT question_id FROM player_answers WHERE room_code = $1`;
            const usedQuestionsResult = await this.db.query(usedQuestionsQuery, [roomCode]);
            const excludeIds = usedQuestionsResult.rows.map((row: any) => row.question_id);
            console.log(`[advanceToNextQuestion] Excluding IDs: ${excludeIds.join(', ')}`);

            // Fetch game categories and difficulty
            const gameQuery = `SELECT selected_categories, difficulty_mode FROM games WHERE game_id = $1`;
            const gameResult = await this.db.query(gameQuery, [gameId]);
            const categories = gameResult.rows[0]?.selected_categories || null;
            const difficultyMode = gameResult.rows[0]?.difficulty_mode || 'standard';

            // Fetch the next question
            const nextLevel = currentLevel + 1;
            const nextQuestion = await this.questionModel.getQuestionByLevel(nextLevel, excludeIds, categories, difficultyMode);

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

            // Prepare question data for clients (without correct answer)
            const options = this.getConsistentOptions(
                nextQuestion.id,
                [...nextQuestion.incorrect_answers, nextQuestion.correct_answer]
            );
            const questionToSendToSocket = {
                id: nextQuestion.id,
                category: nextQuestion.category,
                difficulty: nextQuestion.difficulty,
                question: nextQuestion.question,
                level: nextLevel,
                prize: getPrizeForLevel(nextLevel), // Use the standalone function directly
                options: options
            };

            // Emit newQuestion event
            console.log(`Emitting newQuestion event for level ${nextLevel} in room ${roomCode}`);
            this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);

        } catch (error) {
            console.error('Error in advanceToNextQuestion:', error);
            throw error;
        }
    }

    // A method to get consistent options for a question based on question ID
    private getConsistentOptions(questionId: number, options: string[]): string[] {
        // Use a simple but deterministic shuffle algorithm based on question ID
        const sortedOptions = [...options]; // Make a copy to avoid modifying the original

        // Simple seeded Fisher-Yates shuffle
        const seed = questionId;
        for (let i = sortedOptions.length - 1; i > 0; i--) {
            // Use a simple hash function based on the seed and current index
            const hash = (seed * 9301 + i * 49297) % 233280;
            const j = hash % (i + 1);

            // Swap elements
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

            // Check if host is premium. 
            // req.user has the role from the token.
            if (req.user.role !== 'premium') {
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

            // 3. Emit Socket Event
            this.io.to(roomCode).emit('playerKicked', { userId: userIdToKick, name: kickedName });

            console.log(`Host ${requesterId} kicked player ${userIdToKick} (${kickedName}) from room ${roomCode}`);
            res.status(200).json({ message: 'Player kicked successfully' });

        } catch (error) {
            console.error('Error kicking player:', error);
            res.status(500).json({ error: 'Server error' });
        }
    };

    public pauseGame = async (req: Request | any, res: Response): Promise<void> => {
        try {
            const { roomCode } = req.params;
            const requesterId = req.user?.userId;

            const gameRes = await this.db.query('SELECT host_id FROM games WHERE room_code = $1', [roomCode]);
            if (gameRes.rows.length === 0 || gameRes.rows[0].host_id !== requesterId) {
                res.status(403).json({ error: 'Unauthorized' });
                return;
            }

            // Toggle pause - for now just emit event
            this.io.to(roomCode).emit('gamePaused', { message: 'Game paused by host' });
            res.status(200).json({ message: 'Game paused' });

        } catch (error) {
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
            if (customCategories && customCategories.length > 0) {
                // If user is NOT logged in OR is NOT premium
                if (!user || user.role !== 'premium') { // role mapped from subscription_status in AuthController
                    res.status(403).json({ error: 'Custom topics are for Premium users only.' });
                    return;
                }
            }

            // Check Difficulty Mode Premium Lock
            if (difficultyMode && difficultyMode !== 'standard') {
                if (!user || user.role !== 'premium') {
                    res.status(403).json({ error: 'Difficulty selection is a Premium feature.' });
                    return;
                }
            }

            // Check Moderator Mode Premium Lock (Enabling it is premium)
            // Default is false (Moderator Mode OFF/Auto-run)
            let finalModeratorMode = false;
            // If the user explicitly sends true, OR if we decide default is false (which we did)
            // The frontend sends moderatorMode boolean.
            if (req.body.moderatorMode === true) {
                if (!user || user.role !== 'premium') {
                    res.status(403).json({ error: 'Host View (Moderator Mode) is a Premium feature.' });
                    return;
                }
                finalModeratorMode = true;
            }
            // ---------------------

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
            // Single category -> Target 50 (Deep pool)
            // 10 categories -> Target 5 each (Total 50, sufficient for game)
            const questionsPerCategory = Math.max(5, Math.floor(50 / Math.max(1, uniqueCategories.length)));

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

            // Use the correct column for maximum player count
            const roomQuery = `SELECT player_count FROM games WHERE room_code = $1`; // Use player_count instead of user_count
            const roomResult = await this.db.query(roomQuery, [roomCode]);

            if (roomResult.rows.length === 0) {
                res.status(404).json({ error: 'Room does not exist' });
                return;
            }

            // Validate if the room has reached the maximum number of players
            const maxPlayers = roomResult.rows[0].player_count; // Use player_count for max players
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
                // Generate a new userId and create a new player
                const newUserId = `user_${Math.random().toString(36).substring(2, 10)}`;
                console.log('Generated new userId:', newUserId);
                const insertQuery = `INSERT INTO players (userId, room_code, name) VALUES ($1, $2, $3) RETURNING *`;
                const values = [newUserId, roomCode, userName];
                const insertResult = await this.db.query(insertQuery, values);
                player = insertResult.rows[0];
            }

            console.log('Player successfully joined:', player);

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
            const gameCheckQuery = 'SELECT game_id, status, selected_categories, difficulty_mode FROM games WHERE room_code = $1';
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

            const options = this.getConsistentOptions(questionId, [...(firstQuestion.incorrect_answers || []), firstQuestion.correct_answer]);

            const questionData = {
                id: questionId,
                category: firstQuestion.category,
                difficulty: firstQuestion.difficulty,
                question: firstQuestion.question,
                level: 1,
                prize: getPrizeForLevel(1),
                options: options
            };

            this.io.to(roomCode).emit('gameStarted', { message: 'Game Auto-Started! Room Full.' });

            setTimeout(() => {
                this.io.to(roomCode).emit('newQuestion', questionData);
            }, 2000);

        } catch (error) {
            console.error('Error in tryAutoStart:', error);
        }
    }



    public async startGame(req: Request, res: Response): Promise<void> {
        let firstQuestion: any = null; // Declare firstQuestion here to make it accessible in the broader scope
        const { roomCode } = req.params;
        console.log('startGame method invoked with roomCode:', roomCode);

        if (!roomCode) {
            console.error('startGame: Room code is missing in the request parameters.');
            res.status(400).json({ error: 'Room code is required in URL path' });
            return;
        }

        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            const gameCheckQuery = 'SELECT game_id, status, selected_categories, difficulty_mode FROM games WHERE room_code = $1';
            const gameCheckResult = await client.query(gameCheckQuery, [roomCode]);

            if (gameCheckResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'Game not found with the provided room code' });
                return;
            }

            const game = gameCheckResult.rows[0];
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
            [...(firstQuestion.incorrect_answers || []), firstQuestion.correct_answer]
        );

        const questionToSendToSocket = {
            id: questionIdForSocket,
            category: firstQuestion.category,
            difficulty: firstQuestion.difficulty,
            question: firstQuestion.question,
            level: 1, // current_level was set to 1
            prize: getPrizeForLevel(1), // Use the standalone function directly
            options: options
        };

        // Payload for the HTTP response to the host, including correct answer
        const questionForHost = {
            ...questionToSendToSocket,
            correctAnswer: firstQuestion.correct_answer
        };

        console.log('startGame: Broadcasting gameStarted event to room:', roomCode);
        this.io.to(roomCode).emit('gameStarted', { message: 'The game has started!' });

        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay

        console.log('startGame: Broadcasting newQuestion event to room:', roomCode, 'with question ID:', questionToSendToSocket.id);
        this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);

        res.status(200).json({
            message: 'Game started successfully',
            firstQuestion: questionForHost
        });

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

            // Security Check: Is the player allowed to answer?
            if (game_mode === 'survival') {
                const playerQuery = `SELECT lives FROM players WHERE userId = $1`;
                const playerResult = await this.db.query(playerQuery, [userId]);
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

            // Get Correct Answer
            const questionQuery = `SELECT correct_answer FROM questions WHERE id = $1`;
            const questionResult = await this.db.query(questionQuery, [current_question_id]);
            const { correct_answer } = questionResult.rows[0];
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
                    `INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [userId, current_question_id, answer, isIndividualCorrect, roomCode, current_level]
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
                    const allAnswersQuery = `
                        SELECT p.name, p.userId, pa.answer, pa.is_correct, p.lives, p.score
                        FROM player_answers pa
                        JOIN players p ON pa.user_id = p.userId AND pa.room_code = p.room_code
                        WHERE pa.question_id = $1 AND pa.room_code = $2 AND pa.level = $3
                    `;
                    const allAnswersResult = await this.db.query(allAnswersQuery, [current_question_id, roomCode, current_level]);

                    // Check if *anyone* is still alive to continue
                    const anySurvivorsResult = await this.db.query(`SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND lives > 0`, [roomCode]);
                    const survivors = parseInt(anySurvivorsResult.rows[0].count, 10);

                    let gameEnded = false;
                    let message = 'Round finished.';

                    if (survivors === 0) {
                        gameEnded = true;
                        message = 'Game Over! No survivors.';
                        await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
                    } else if (current_level >= 15) {
                        gameEnded = true;
                        message = 'Game Over! Victory!';
                        await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
                    }

                    this.io.to(roomCode).emit('revealAnswers', {
                        correctAnswer: correct_answer,
                        playerAnswers: allAnswersResult.rows,
                        timeToNextQuestion: waitTimeInfo,
                        currentLevel: current_level,
                        gameEnded,
                        gameMode: 'survival'
                    });

                    if (!gameEnded) {
                        setTimeout(() => {
                            this.advanceToNextQuestion(roomCode, gameId, current_level);
                        }, waitTimeInfo * 1000);
                    } else {
                        this.io.to(roomCode).emit('gameEnded', { message });
                    }

                    res.status(200).json({ message: 'All answers received.', waiting: false });

                } else {
                    // Waiting for others
                    this.io.to(roomCode).emit('playerAnswered', { count: answersCount, total: livingPlayerCount });
                    res.status(200).json({ message: 'Answer recorded. Waiting for other players.', waiting: true });
                }

                return;
            }

            // --- COOPERATIVE MODE LOGIC (As Before) ---

            // Record answer (temporarily mark is_correct based on individual, but game logic uses voting)
            const recordAnswerQuery = `
                INSERT INTO player_answers (user_id, question_id, answer, is_correct, room_code, level)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            await this.db.query(recordAnswerQuery, [userId, current_question_id, answer, isIndividualCorrect, roomCode, current_level]);

            // Check if all players have answered
            const countQuery = `SELECT COUNT(*) as count FROM player_answers WHERE question_id = $1 AND room_code = $2 AND level = $3`;
            const countResult = await this.db.query(countQuery, [current_question_id, roomCode, current_level]);
            const answersCount = parseInt(countResult.rows[0].count, 10);

            if (answersCount < player_count) {
                // Not everyone answered yet
                this.io.to(roomCode).emit('playerAnswered', { count: answersCount, total: player_count });
                res.status(200).json({ message: 'Answer recorded. Waiting for teammates.', waiting: true });
                return;
            }

            // --- ALL PLAYERS ANSWERED: RESOLVE ROUND ---

            // Determine Team Answer (Majority Vote)
            const voteQuery = `
                SELECT answer, COUNT(*) as vote_count 
                FROM player_answers 
                WHERE question_id = $1 AND room_code = $2 AND level = $3 
                GROUP BY answer 
                ORDER BY vote_count DESC, answer ASC 
                LIMIT 1
            `;
            const voteResult = await this.db.query(voteQuery, [current_question_id, roomCode, current_level]);
            const teamAnswer = voteResult.rows[0].answer;
            const isTeamCorrect = teamAnswer === correct_answer;

            let nextQuestionData = null;
            let gameEnded = false;
            let newLives = lives;

            const currentPrize = getPrizeForLevel(current_level);

            if (isTeamCorrect) {
                // Update scores for ALL players
                const updateScoreQuery = `UPDATE players SET score = $1 WHERE room_code = $2`;
                await this.db.query(updateScoreQuery, [currentPrize, roomCode]);

                if (current_level >= 15) {
                    gameEnded = true;
                    await this.db.query(`UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`, [gameId]);
                }
            } else {
                // Team is WRONG
                newLives = lives - 1;
                await this.db.query(`UPDATE games SET lives = $1, last_active = CURRENT_TIMESTAMP WHERE game_id = $2`, [newLives, gameId]);

                if (newLives <= 0) {
                    gameEnded = true;
                    await this.db.query(`UPDATE games SET status = 'ended' WHERE game_id = $1`, [gameId]);
                }
            }

            // Get all player answers for reveal
            const allAnswersQuery = `
                SELECT p.name, pa.answer, pa.is_correct 
                FROM player_answers pa
                JOIN players p ON pa.user_id = p.userId AND pa.room_code = p.room_code
                WHERE pa.question_id = $1 AND pa.room_code = $2 AND pa.level = $3
            `;
            const allAnswersResult = await this.db.query(allAnswersQuery, [current_question_id, roomCode, current_level]);

            const revealPayload = {
                correctAnswer: correct_answer,
                teamAnswer: teamAnswer,
                isTeamCorrect: isTeamCorrect,
                livesRemaining: newLives,
                playerAnswers: allAnswersResult.rows,
                timeToNextQuestion: waitTimeInfo,
                currentLevel: current_level,
                gameEnded: gameEnded,
                gameMode: 'cooperative'
            };

            this.io.to(roomCode).emit('revealAnswers', revealPayload);

            if (!gameEnded) {
                setTimeout(() => {
                    this.advanceToNextQuestion(roomCode, gameId, current_level);
                }, waitTimeInfo * 1000); // Configurable wait time
            } else {
                this.io.to(roomCode).emit('gameEnded', { message: isTeamCorrect ? 'You won!' : 'Game Over (Lives Depleted)' });
            }

            res.status(200).json({ message: 'Round resolved', waiting: false, teamAnswer, isTeamCorrect });

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
            const gameQuery = `SELECT game_id, current_question_id, game_mode, jokers_used as team_jokers FROM games WHERE room_code = $1 AND status = 'started'`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Active game not found.' });
                return;
            }

            const { game_id, current_question_id, game_mode, team_jokers } = gameResult.rows[0];

            if (!current_question_id) {
                res.status(409).json({ error: 'No active question.' });
                return;
            }

            // Check if joker used
            console.log(`[useJoker] User: ${userId}, Type: ${jokerType}, Mode: ${game_mode}`);

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
                const playerQuery = `SELECT jokers_used FROM players WHERE userId = $1`;
                const playerResult = await this.db.query(playerQuery, [userId]);
                if (playerResult.rows.length === 0) {
                    res.status(404).json({ error: 'Player not found.' });
                    return;
                }
                const playerJokers = playerResult.rows[0].jokers_used || [];
                console.log(`[useJoker] Player Jokers Used (${userId}): ${JSON.stringify(playerJokers)}`);

                if (playerJokers.includes(jokerType)) {
                    console.warn(`[useJoker] REJECT: Joker ${jokerType} already used by player.`);
                    res.status(403).json({ error: 'You have already used this joker.' });
                    return;
                }
            }

            // Fetch Question Data
            const questionQuery = `SELECT * FROM questions WHERE id = $1`;
            const questionResult = await this.db.query(questionQuery, [current_question_id]);
            const question = questionResult.rows[0];

            let payload: any = {};

            // LOGIC BY TYPE
            if (jokerType === '5050') {
                // Return 2 incorrect answers
                const incorrect = question.incorrect_answers;
                const shuffledIncorrect = incorrect.sort(() => 0.5 - Math.random());
                payload = {
                    wrongAnswersToRemove: shuffledIncorrect.slice(0, 2)
                };
            } else if (jokerType === 'audience') {
                // Simulate Audience
                const difficulty = question.difficulty;
                let correctChance = 0.9; // Easy
                if (difficulty === 'medium') correctChance = 0.6;
                if (difficulty === 'hard') correctChance = 0.4;
                if (difficulty === 'very_hard') correctChance = 0.25;

                const options = this.getConsistentOptions(question.id, [...question.incorrect_answers, question.correct_answer]);
                const stats: Record<string, number> = {};
                let remaining = 100;

                // Probability roll
                const correctVote = Math.random() < correctChance ? Math.floor(correctChance * 100) : Math.floor(Math.random() * 40);

                // Assign votes
                options.forEach(opt => {
                    if (opt === question.correct_answer) {
                        stats[opt] = correctVote;
                        remaining -= correctVote;
                    } else {
                        stats[opt] = 0; // Init
                    }
                });

                // Distribute remaining
                const otherOptions = options.filter(o => o !== question.correct_answer);
                otherOptions.forEach((opt, idx) => {
                    if (idx === otherOptions.length - 1) {
                        stats[opt] = remaining;
                    } else {
                        const val = Math.floor(Math.random() * remaining);
                        stats[opt] = val;
                        remaining -= val;
                    }
                });

                payload = { stats };

            } else if (jokerType === 'phone') {
                const difficulty = question.difficulty;
                const hit = Math.random();
                let isCorrect = false;

                // Heuristic for friend correctness
                if (difficulty === 'easy' && hit > 0.1) isCorrect = true;
                else if (difficulty === 'medium' && hit > 0.4) isCorrect = true;
                else if (difficulty === 'hard' && hit > 0.7) isCorrect = true;
                else if (difficulty === 'very_hard' && hit > 0.9) isCorrect = true;

                payload = {
                    message: isCorrect
                        ? `I'm pretty sure it's "${question.correct_answer}".`
                        : `I'm not sure, maybe "${question.incorrect_answers[0]}"?`
                };
            }

            // MARK AS USED
            if (game_mode === 'cooperative') {
                await this.db.query(`UPDATE games SET jokers_used = array_append(jokers_used, $1) WHERE game_id = $2`, [jokerType, game_id]);
                // Broadcast to update all clients that team joker is used
                this.io.to(roomCode).emit('jokerUsed', { jokerType, userId: 'TEAM' });
            } else {
                await this.db.query(`UPDATE players SET jokers_used = array_append(jokers_used, $1) WHERE userId = $2`, [jokerType, userId]);
                // User specific response, no broadcast needed for personal joker consumption usually, but maybe for UI status
            }

            res.status(200).json({ ...payload, jokerType });

        } catch (error) {
            console.error('Error using joker:', error);
            res.status(500).json({ error: 'Server error using joker' });
        }
    }

    public async getQuestions(req: Request, res: Response): Promise<void> {
        try {
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

            // Fetch game details using the appropriate column
            const gameQuery = isNumericId
                ? `SELECT * FROM games WHERE game_id = $1`
                : `SELECT * FROM games WHERE room_code = $1`;

            const gameResult = await this.db.query(gameQuery, [id]);
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

            // Sanitized: NO userId
            const query = `SELECT name, score, lives, jokers_used FROM players WHERE room_code = $1 ORDER BY score DESC`;
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
            const gameQuery = `SELECT current_question_id, current_level, status, selected_categories FROM games WHERE room_code = $1`;
            const gameResult = await this.db.query(gameQuery, [roomCode]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({ error: 'Game not found' });
                return;
            }

            const { current_question_id, current_level, status, selected_categories } = gameResult.rows[0];

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
                        [...newQuestion.incorrect_answers, newQuestion.correct_answer]
                    );

                    const questionToSend = {
                        id: questionId,
                        category: newQuestion.category,
                        difficulty: newQuestion.difficulty,
                        question: newQuestion.question,
                        level: current_level || 1,
                        prize: getPrizeForLevel(current_level || 1),
                        options: options,
                        correctAnswer: newQuestion.correct_answer,
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
                    [...newQuestion.incorrect_answers, newQuestion.correct_answer]
                );

                const recoveredQuestion = {
                    id: questionId,
                    category: newQuestion.category,
                    difficulty: newQuestion.difficulty,
                    question: newQuestion.question,
                    level: current_level,
                    prize: getPrizeForLevel(current_level),
                    options: options,
                    correctAnswer: newQuestion.correct_answer,
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
                [...question.incorrect_answers, question.correct_answer]
            );

            const questionToSend = {
                id: question.id,
                category: question.category,
                difficulty: question.difficulty,
                question: question.question,
                level: current_level,
                prize: getPrizeForLevel(current_level),
                options: options,
                correctAnswer: question.correct_answer, // Include correctAnswer for the host fetching via HTTP
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
