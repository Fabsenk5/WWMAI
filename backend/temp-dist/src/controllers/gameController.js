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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;
exports.getPrizeForLevel = getPrizeForLevel;
const questionModel_1 = require("../models/questionModel");
// Helper function to shuffle an array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
// Define prize amounts as a standalone constant at the module level
const PRIZE_AMOUNTS = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
// Helper function for getting prize - completely independent of class
function getPrizeForLevel(level) {
    return PRIZE_AMOUNTS[level - 1] || 0;
}
class GameController {
    // Class method now just calls the standalone function
    getPrizeForLevel(level) {
        // Call the standalone function to ensure it works even with 'this' context issues
        return getPrizeForLevel(level);
    }
    // Helper method to advance to the next question
    advanceToNextQuestion(roomCode, gameId, currentLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`Advancing game in room ${roomCode} from level ${currentLevel} to ${currentLevel + 1}`);
                // Check if it was the last level
                if (currentLevel >= 15) {
                    console.log(`Game in room ${roomCode} has reached the maximum level. Ending game.`);
                    // Update game status to 'ended'
                    const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                    yield this.db.query(endGameQuery, [gameId]);
                    // Emit gameEnded event
                    this.io.to(roomCode).emit('gameEnded', { message: 'Game has ended. Maximum level reached.' });
                    return;
                }
                // Fetch the next question
                const nextLevel = currentLevel + 1;
                const nextQuestion = yield this.questionModel.getQuestionByLevel(nextLevel);
                if (!nextQuestion) {
                    console.error(`Failed to fetch question for level ${nextLevel}`);
                    // End game if no next question is available
                    const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                    yield this.db.query(endGameQuery, [gameId]);
                    this.io.to(roomCode).emit('gameEnded', { message: 'Game has ended. No more questions available.' });
                    return;
                }
                // Update game to next level and next question
                const updateGameQuery = `
                UPDATE games 
                SET current_level = $1, current_question_id = $2, last_active = CURRENT_TIMESTAMP 
                WHERE game_id = $3
            `;
                yield this.db.query(updateGameQuery, [nextLevel, nextQuestion.id, gameId]);
                // Prepare question data for clients (without correct answer)
                const options = shuffle([...nextQuestion.incorrect_answers, nextQuestion.correct_answer]);
                const questionToSendToSocket = {
                    id: nextQuestion.id,
                    category: nextQuestion.category,
                    difficulty: nextQuestion.difficulty,
                    question: nextQuestion.question,
                    level: nextLevel,
                    prize: this.getPrizeForLevel(nextLevel),
                    options: options
                };
                // Emit newQuestion event
                console.log(`Emitting newQuestion event for level ${nextLevel} in room ${roomCode}`);
                this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);
            }
            catch (error) {
                console.error('Error in advanceToNextQuestion:', error);
                throw error;
            }
        });
    }
    // A method to get consistent options for a question based on question ID
    getConsistentOptions(questionId, options) {
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
    constructor(dbPool, io) {
        this.db = dbPool;
        this.questionModel = new questionModel_1.QuestionModel(this.db);
        this.io = io; // Store io instance
        console.log('GameController instantiated with io:', this.io); // Debug log to confirm io instance
    }
    createGame(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { gameName, playerCount } = req.body;
                if (!gameName || playerCount <= 0) {
                    res.status(400).json({ error: 'Invalid game name or player count' });
                    return;
                }
                const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const query = `INSERT INTO games (name, player_count, room_code) VALUES ($1, $2, $3) RETURNING game_id, room_code`;
                const values = [gameName, playerCount, roomCode];
                const result = yield this.db.query(query, values);
                res.status(201).json({ message: 'Game created successfully', gameId: result.rows[0].game_id, roomCode: result.rows[0].room_code });
            }
            catch (error) {
                console.error('Error creating game:', error);
                res.status(500).json({ error: 'Failed to create game due to server error' });
            }
        });
    }
    // Updated joinGame to handle duplicate player names
    joinGame(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { roomCode, userName, userId } = req.body; // Ensure consistent naming
                console.log('joinGame called with:', { roomCode, userName, userId });
                if (!roomCode || !userName) {
                    res.status(400).json({ error: 'Room code and user name are required' });
                    return;
                }
                // Use the correct column for maximum player count
                const roomQuery = `SELECT player_count FROM games WHERE room_code = $1`; // Use player_count instead of user_count
                const roomResult = yield this.db.query(roomQuery, [roomCode]);
                if (roomResult.rows.length === 0) {
                    res.status(404).json({ error: 'Room does not exist' });
                    return;
                }
                // Validate if the room has reached the maximum number of players
                const maxPlayers = roomResult.rows[0].player_count; // Use player_count for max players
                const userCountQuery = `SELECT COUNT(*) AS user_count FROM players WHERE room_code = $1`;
                const userCountResult = yield this.db.query(userCountQuery, [roomCode]);
                const currentUserCount = parseInt(userCountResult.rows[0].user_count, 10);
                if (currentUserCount >= maxPlayers) {
                    res.status(403).json({ error: 'Room is full' });
                    return;
                }
                let player;
                if (userId) {
                    console.log('Attempting to fetch existing player with userId:', userId);
                    const query = `SELECT * FROM players WHERE userId = $1 AND room_code = $2`;
                    const result = yield this.db.query(query, [userId, roomCode]);
                    if (result.rows.length > 0) {
                        player = result.rows[0];
                    }
                    else {
                        console.warn('Provided userId does not exist in the room. Creating a new player.');
                    }
                }
                if (!player) {
                    // Generate a new userId and create a new player
                    const newUserId = `user_${Math.random().toString(36).substring(2, 10)}`;
                    console.log('Generated new userId:', newUserId);
                    const insertQuery = `INSERT INTO players (userId, room_code, name) VALUES ($1, $2, $3) RETURNING *`;
                    const values = [newUserId, roomCode, userName];
                    const insertResult = yield this.db.query(insertQuery, values);
                    player = insertResult.rows[0];
                }
                console.log('Player successfully joined:', player);
                res.status(200).json({ userId: player.userid });
            }
            catch (err) {
                console.error('Error in joinGame method:', err);
                const error = err;
                if (error.message.includes('duplicate key value')) {
                    res.status(409).json({ error: 'Player name already exists in this room. Please choose a different name.' });
                }
                else {
                    res.status(500).json({ error: 'Failed to join game due to server error' });
                }
            }
        });
    }
    startGame(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            let firstQuestion = null; // Declare firstQuestion here to make it accessible in the broader scope
            const { roomCode } = req.params;
            console.log('startGame method invoked with roomCode:', roomCode);
            if (!roomCode) {
                console.error('startGame: Room code is missing in the request parameters.');
                res.status(400).json({ error: 'Room code is required in URL path' });
                return;
            }
            const client = yield this.db.connect();
            try {
                yield client.query('BEGIN');
                const gameCheckQuery = 'SELECT game_id, status FROM games WHERE room_code = $1';
                const gameCheckResult = yield client.query(gameCheckQuery, [roomCode]);
                if (gameCheckResult.rows.length === 0) {
                    yield client.query('ROLLBACK');
                    res.status(404).json({ error: 'Game not found with the provided room code' });
                    return;
                }
                const game = gameCheckResult.rows[0];
                if (game.status !== 'pending') {
                    yield client.query('ROLLBACK');
                    res.status(409).json({
                        error: `Game cannot be started. Current status: ${game.status}`,
                        currentStatus: game.status
                    });
                    return;
                }
                console.log('startGame: Fetching the first question for level 1.');
                firstQuestion = yield this.questionModel.getQuestionByLevel(1); // Assign to the outer scoped firstQuestion
                if (!firstQuestion) {
                    yield client.query('ROLLBACK');
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
                const updateResult = yield client.query(updateQuery, [questionIdForDb, roomCode]);
                if (updateResult.rowCount === 0) {
                    yield client.query('ROLLBACK');
                    console.error('startGame: Game not found or could not be updated.');
                    res.status(500).json({ error: 'Game could not be updated' });
                    return;
                }
                yield client.query('COMMIT');
                console.log('startGame: Game status updated successfully. Database transaction committed.');
            }
            catch (error) {
                yield client.query('ROLLBACK');
                client.release(); // Release client in case of error before finally
                console.error('startGame: Error during database transaction:', error);
                // It's important to send a response here or rethrow if a higher-level handler will send it
                res.status(500).json({ error: 'Failed to start game due to database error' });
                return; // Ensure no further code in startGame executes if DB part fails
            }
            finally {
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
            const options = this.getConsistentOptions(questionIdForSocket, [...(firstQuestion.incorrect_answers || []), firstQuestion.correct_answer]);
            const questionToSendToSocket = {
                id: questionIdForSocket,
                category: firstQuestion.category,
                difficulty: firstQuestion.difficulty,
                question: firstQuestion.question,
                level: 1, // current_level was set to 1
                prize: PRIZE_AMOUNTS[0], // Use the constant directly instead of this.getPrizeForLevel(1)
                options: options
            };
            // Payload for the HTTP response to the host, including correct answer
            const questionForHost = Object.assign(Object.assign({}, questionToSendToSocket), { correctAnswer: firstQuestion.correct_answer });
            console.log('startGame: Broadcasting gameStarted event to room:', roomCode);
            this.io.to(roomCode).emit('gameStarted', { message: 'The game has started!' });
            yield new Promise(resolve => setTimeout(resolve, 50)); // Small delay
            console.log('startGame: Broadcasting newQuestion event to room:', roomCode, 'with question ID:', questionToSendToSocket.id);
            this.io.to(roomCode).emit('newQuestion', questionToSendToSocket);
            res.status(200).json({
                message: 'Game started successfully',
                firstQuestion: questionForHost
            });
        });
    }
    handleAnswer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Read roomCode from URL parameters
                const { roomCode } = req.params;
                const { userId, answer } = req.body;
                if (!roomCode || !userId || answer === undefined) {
                    res.status(400).json({ error: 'Room code (in URL), user ID, and answer are required' });
                    return;
                }
                // Get current game state (level and question ID)
                const gameQuery = `SELECT game_id, current_level, current_question_id FROM games WHERE room_code = $1 AND status = 'started'`;
                const gameResult = yield this.db.query(gameQuery, [roomCode]);
                if (gameResult.rows.length === 0) {
                    res.status(404).json({ error: 'Active game not found for this room code.' });
                    return;
                }
                const { game_id: gameId, current_level, current_question_id } = gameResult.rows[0];
                if (!current_question_id) {
                    res.status(409).json({ error: 'No question is currently active for this game.' }); // Conflict
                    return;
                }
                // Fetch the correct answer and prize for the current question
                // Note: Prize is determined by level, not stored directly in questions table per schema
                const questionQuery = `SELECT correct_answer FROM questions WHERE question_id = $1`;
                const questionResult = yield this.db.query(questionQuery, [current_question_id]);
                if (questionResult.rows.length === 0) {
                    res.status(404).json({ error: 'Current question details not found.' });
                    return;
                }
                const { correct_answer } = questionResult.rows[0];
                // Assuming prizeAmounts is accessible or redefined here/imported
                const prizeAmounts = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
                const currentPrize = prizeAmounts[current_level - 1] || 0;
                const isCorrect = answer === correct_answer;
                let nextQuestionData = null;
                let gameEnded = false;
                let playerLost = false;
                if (isCorrect) {
                    // Update player's score
                    const updateScoreQuery = `UPDATE players SET score = score + $1 WHERE userId = $2 AND room_code = $3`;
                    yield this.db.query(updateScoreQuery, [currentPrize, userId, roomCode]);
                    // Check if it was the last level
                    if (current_level >= 15) {
                        gameEnded = true;
                        // Optionally update game status to 'ended'
                        const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                        yield this.db.query(endGameQuery, [gameId]);
                    }
                    else {
                        // Fetch the next question only if the level increases
                        const nextLevel = current_level + 1;
                        const nextQuestion = yield this.questionModel.getQuestionByLevel(nextLevel);
                        if (!nextQuestion) {
                            // Handle case where no more questions are available (should ideally not happen if 15 levels are guaranteed)
                            console.error(`Failed to fetch question for level ${nextLevel}`);
                            // Decide how to handle this - end game? error?
                            gameEnded = true; // End game if no next question
                            const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                            yield this.db.query(endGameQuery, [gameId]);
                        }
                        else {
                            // Update game to next level and next question
                            const updateGameQuery = `UPDATE games SET current_level = $1, current_question_id = $2, last_active = CURRENT_TIMESTAMP WHERE game_id = $3`;
                            yield this.db.query(updateGameQuery, [nextLevel, nextQuestion.id, gameId]);
                            const { correct_answer: nextCorrectAnswer } = nextQuestion, questionToSend = __rest(nextQuestion, ["correct_answer"]);
                            nextQuestionData = questionToSend; // Prepare next question data for response
                        }
                    }
                }
                else {
                    // Incorrect answer: Deduct a life
                    const updateLivesQuery = `UPDATE players SET lives = lives - 1 WHERE userId = $1 AND room_code = $2 RETURNING lives`;
                    const livesResult = yield this.db.query(updateLivesQuery, [userId, roomCode]);
                    if (livesResult.rows.length > 0 && livesResult.rows[0].lives <= 0) {
                        playerLost = true;
                        gameEnded = true; // Player is out, potentially end game for all? Or just mark player? Depends on rules.
                        // For now, let's assume game ends for the player. We might need player status.
                        // Optionally update game status if this means game over for everyone
                        const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                        yield this.db.query(endGameQuery, [gameId]);
                    }
                    // If incorrect, player stays on the same question/level until they get it right or lose?
                    // Or does the game move on? Let's assume the game moves on for now.
                    // Fetch the next question even if incorrect? Or repeat?
                    // Let's assume we move to the next question regardless of correctness for simplicity here.
                    // Re-using the logic from the 'correct' branch to advance the game state:
                    if (current_level >= 15) {
                        gameEnded = true;
                        const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                        yield this.db.query(endGameQuery, [gameId]);
                    }
                    else {
                        const nextLevel = current_level + 1; // Still advance level? Or stay? Let's advance.
                        const nextQuestion = yield this.questionModel.getQuestionByLevel(nextLevel);
                        if (!nextQuestion) {
                            console.error(`Failed to fetch question for level ${nextLevel}`);
                            gameEnded = true;
                            const endGameQuery = `UPDATE games SET status = 'ended', last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                            yield this.db.query(endGameQuery, [gameId]);
                        }
                        else {
                            const updateGameQuery = `UPDATE games SET current_level = $1, current_question_id = $2, last_active = CURRENT_TIMESTAMP WHERE game_id = $3`;
                            yield this.db.query(updateGameQuery, [nextLevel, nextQuestion.id, gameId]);
                            const { correct_answer: nextCorrectAnswer } = nextQuestion, questionToSend = __rest(nextQuestion, ["correct_answer"]);
                            nextQuestionData = questionToSend;
                        }
                    }
                }
                // Record the answer
                const recordAnswerQuery = `
                INSERT INTO player_answers (user_id, question_id, answer, is_correct)
                VALUES ($1, $2, $3, $4)
            `;
                // Ensure current_question_id is defined before using it
                if (current_question_id) {
                    yield this.db.query(recordAnswerQuery, [userId, current_question_id, answer, isCorrect]);
                }
                else {
                    // Handle the case where current_question_id might be null/undefined if game ended unexpectedly
                    console.warn(`handleAnswer: Could not record answer for user ${userId} in room ${roomCode} because current_question_id is not set.`);
                }
                // Update game's last active timestamp
                const updateLastActiveQuery = `UPDATE games SET last_active = CURRENT_TIMESTAMP WHERE game_id = $1`;
                yield this.db.query(updateLastActiveQuery, [gameId]);
                res.status(200).json({
                    correct: isCorrect,
                    correctAnswer: isCorrect ? undefined : correct_answer, // Reveal correct answer if wrong
                    playerLost: playerLost,
                    gameEnded: gameEnded,
                    nextQuestion: nextQuestionData // Send null if game ended or no next question
                });
            }
            catch (error) {
                console.error('Error handling answer:', error);
                res.status(500).json({ error: 'Failed to handle answer due to server error' });
            }
        });
    }
    getQuestions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Fetching questions...');
                const questions = yield this.questionModel.find();
                console.log(`Questions fetched: ${questions.length} questions`); // Log count instead of full data
                res.status(200).json(questions);
            }
            catch (error) {
                console.error('Error fetching questions:', error);
                res.status(500).json({ error: 'Failed to fetch questions due to server error' });
            }
        });
    }
    getGameById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const gameResult = yield this.db.query(gameQuery, [id]);
                console.log(`[getGameById] Game query result count: ${gameResult.rows.length}`); // Log query result
                if (gameResult.rows.length === 0) {
                    console.log(`[getGameById] Game not found for ID: ${id}`); // Log not found
                    res.status(404).json({ error: 'Game not found' });
                    return;
                }
                const game = gameResult.rows[0];
                console.log(`[getGameById] Found game:`, game); // Log found game data
                // Fetch players associated with the game using room_code
                const playersQuery = `SELECT name, score, lives FROM players WHERE room_code = $1`;
                const playersResult = yield this.db.query(playersQuery, [game.room_code]);
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
                const responseData = Object.assign(Object.assign({}, game), { players });
                console.log(`[getGameById] Sending response data for ID ${id}:`, responseData); // Log response data
                res.status(200).json(responseData);
            }
            catch (error) {
                console.error(`[getGameById] Error fetching game by ID ${req.params.id}:`, error); // Log error
                res.status(500).json({ error: 'Failed to fetch game by ID due to server error' });
            }
        });
    }
    // Method to fetch the current question for a game
    getCurrentQuestion(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { roomCode } = req.params; // Assuming roomCode is passed as a URL parameter
                if (!roomCode) {
                    res.status(400).json({ error: 'Room code is required' });
                    return;
                }
                const userId = req.query.userId || null;
                // Fetch the current game info using roomCode
                const gameQuery = `SELECT current_question_id, current_level, status FROM games WHERE room_code = $1`;
                const gameResult = yield this.db.query(gameQuery, [roomCode]);
                if (gameResult.rows.length === 0) {
                    res.status(404).json({ error: 'Game not found' });
                    return;
                }
                const { current_question_id, current_level, status } = gameResult.rows[0];
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
                    const answerResult = yield this.db.query(answerQuery, [userId, current_question_id]);
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
                        const newQuestion = yield this.questionModel.getQuestionByLevel(current_level || 1);
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
                        yield this.db.query(`UPDATE games SET current_question_id = $1 WHERE room_code = $2`, [questionId, roomCode]);
                        // Get consistent options for this question
                        const options = this.getConsistentOptions(questionId, [...newQuestion.incorrect_answers, newQuestion.correct_answer]);
                        const questionToSend = {
                            id: questionId,
                            category: newQuestion.category,
                            difficulty: newQuestion.difficulty,
                            question: newQuestion.question,
                            level: current_level || 1,
                            prize: this.getPrizeForLevel(current_level || 1),
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
                    }
                    catch (error) {
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
                const question = yield this.questionModel.getQuestionById(current_question_id);
                if (!question) {
                    console.error(`Question with ID ${current_question_id} not found. Trying to recover with a new question.`);
                    // Try to recover by getting a new question for the current level
                    const newQuestion = yield this.questionModel.getQuestionByLevel(current_level || 1);
                    if (!newQuestion) {
                        res.status(404).json({ error: 'Current question not found and unable to retrieve a replacement.' });
                        return;
                    }
                    // Update the game with the new question
                    const questionId = newQuestion.question_id || newQuestion.id;
                    yield this.db.query(`UPDATE games SET current_question_id = $1 WHERE room_code = $2`, [questionId, roomCode]);
                    // Continue with the new question
                    const options = this.getConsistentOptions(questionId, [...newQuestion.incorrect_answers, newQuestion.correct_answer]);
                    const recoveredQuestion = {
                        id: questionId,
                        category: newQuestion.category,
                        difficulty: newQuestion.difficulty,
                        question: newQuestion.question,
                        level: current_level,
                        prize: this.getPrizeForLevel(current_level),
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
                const options = this.getConsistentOptions(question.id, [...question.incorrect_answers, question.correct_answer]);
                const questionToSend = {
                    id: question.id,
                    category: question.category,
                    difficulty: question.difficulty,
                    question: question.question,
                    level: current_level,
                    prize: this.getPrizeForLevel(current_level),
                    options: options,
                    correctAnswer: question.correct_answer, // Include correctAnswer for the host fetching via HTTP
                    status: status,
                    userHasAnswered: userHasAnswered,
                    userAnswer: userAnswer ? userAnswer.answer : null,
                    isCorrect: userAnswer ? userAnswer.is_correct : null
                };
                console.log('getCurrentQuestion: Sending question payload:', questionToSend);
                res.status(200).json(questionToSend);
            }
            catch (error) {
                console.error('Error fetching current question:', error);
                res.status(500).json({ error: 'Failed to fetch current question due to server error' });
            }
        });
    }
    submitAnswer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Read roomCode from URL parameters
                const { roomCode } = req.params;
                const { userId, answer } = req.body;
                if (!roomCode || !userId || answer === undefined) {
                    res.status(400).json({ error: 'Room code (in URL), user ID, and answer are required' });
                    return;
                }
                // Check if this user has already submitted an answer for the current question
                const gameQuery = `SELECT game_id, current_question_id, current_level FROM games WHERE room_code = $1 AND status = 'started'`;
                const gameResult = yield this.db.query(gameQuery, [roomCode]);
                if (gameResult.rows.length === 0) {
                    res.status(404).json({ error: 'Active game not found for this room code.' });
                    return;
                }
                const { game_id: gameId, current_question_id, current_level } = gameResult.rows[0];
                if (!current_question_id) {
                    res.status(409).json({ error: 'No active question for this game.' });
                    return;
                }
                // Check if this player has already submitted an answer for this question
                const existingAnswerQuery = `
                SELECT * FROM player_answers 
                WHERE user_id = $1 AND question_id = $2
            `;
                const existingAnswerResult = yield this.db.query(existingAnswerQuery, [userId, current_question_id]);
                if (existingAnswerResult.rows.length > 0) {
                    res.status(403).json({
                        error: 'You have already submitted an answer for this question.',
                        alreadyAnswered: true,
                        yourAnswer: existingAnswerResult.rows[0].answer,
                        isCorrect: existingAnswerResult.rows[0].is_correct
                    });
                    return; // Just return without sending a response object
                }
                // Get question details including correct answer
                const questionQuery = `SELECT correct_answer FROM questions WHERE question_id = $1`;
                const questionResult = yield this.db.query(questionQuery, [current_question_id]);
                if (questionResult.rows.length === 0) {
                    res.status(404).json({ error: 'Question details not found.' });
                    return;
                }
                const { correct_answer } = questionResult.rows[0];
                const isCorrect = answer === correct_answer;
                // Calculate prize amount for this level
                const prizeAmount = this.getPrizeForLevel(current_level);
                // Update player's score if correct
                if (isCorrect) {
                    const updateScoreQuery = `
                    UPDATE players 
                    SET score = score + $1 
                    WHERE userId = $2 AND room_code = $3 
                    RETURNING *
                `;
                    const updateResult = yield this.db.query(updateScoreQuery, [prizeAmount, userId, roomCode]);
                    // Log the updated player data for debugging
                    if (updateResult.rows.length > 0) {
                        console.log(`Score updated for player ${userId} in room ${roomCode}. New score: ${updateResult.rows[0].score}`);
                    }
                    else {
                        console.warn(`No player record updated for userId ${userId} in room ${roomCode}`);
                    }
                }
                else {
                    // Reduce lives if incorrect
                    const updateLivesQuery = `
                    UPDATE players 
                    SET lives = GREATEST(lives - 1, 0) 
                    WHERE userId = $1 AND room_code = $2 
                    RETURNING *
                `;
                    const updateResult = yield this.db.query(updateLivesQuery, [userId, roomCode]);
                    if (updateResult.rows.length > 0) {
                        console.log(`Lives updated for player ${userId} in room ${roomCode}. Remaining lives: ${updateResult.rows[0].lives}`);
                    }
                }
                // Record the player's answer
                const insertAnswerQuery = `
                INSERT INTO player_answers (user_id, question_id, answer, is_correct)
                VALUES ($1, $2, $3, $4)
            `;
                // Use userId (as user_id), current_question_id, answer, and isCorrect
                yield this.db.query(insertAnswerQuery, [userId, current_question_id, answer, isCorrect]);
                // Check if all living players have submitted their answers
                // Fetch players in the room (only consider those with lives > 0)
                const playersQuery = `
                SELECT COUNT(*) AS total_players FROM players WHERE room_code = $1 AND lives > 0
            `;
                // Fetch number of distinct players who answered this specific question
                const answersQuery = `
                SELECT COUNT(DISTINCT user_id) AS total_answers FROM player_answers WHERE question_id = $1
            `;
                const playersResult = yield this.db.query(playersQuery, [roomCode]);
                // Pass current_question_id to the answers query
                const answersResult = yield this.db.query(answersQuery, [current_question_id]);
                const totalPlayers = parseInt(playersResult.rows[0].total_players, 10);
                const totalAnswers = parseInt(answersResult.rows[0].total_answers, 10);
                // Get current player data to include in response
                const playerDataQuery = `SELECT name, score, lives FROM players WHERE userId = $1 AND room_code = $2`;
                const playerDataResult = yield this.db.query(playerDataQuery, [userId, roomCode]);
                const playerData = playerDataResult.rows[0] || null;
                if (totalAnswers >= totalPlayers) {
                    console.log(`All ${totalPlayers} players have submitted answers for question ${current_question_id}.`);
                    // Fetch all player answers
                    const allAnswersQuery = `
                    SELECT p.name, pa.answer, pa.is_correct
                    FROM player_answers pa
                    JOIN players p ON pa.user_id = p.userId
                    WHERE pa.question_id = $1 AND p.room_code = $2
                `;
                    const allAnswersResult = yield this.db.query(allAnswersQuery, [current_question_id, roomCode]);
                    const playerAnswers = allAnswersResult.rows;
                    // Emit a 'revealAnswers' event to all clients in the room
                    this.io.to(roomCode).emit('revealAnswers', {
                        correctAnswer: correct_answer,
                        playerAnswers: playerAnswers,
                        timeToNextQuestion: 15, // 15 seconds countdown
                        currentLevel: current_level
                    });
                    // Schedule the next question after 15 seconds
                    setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                        try {
                            // Check if the game is still active before proceeding
                            const currentGameQuery = `SELECT status FROM games WHERE room_code = $1`;
                            const currentGameResult = yield this.db.query(currentGameQuery, [roomCode]);
                            if (currentGameResult.rows.length === 0 || currentGameResult.rows[0].status !== 'started') {
                                console.log(`Game in room ${roomCode} is no longer active. Skipping next question.`);
                                return;
                            }
                            // Proceed to the next question/level
                            yield this.advanceToNextQuestion(roomCode, gameId, current_level);
                        }
                        catch (error) {
                            console.error('Error advancing to next question:', error);
                        }
                    }), 15000); // 15 seconds
                    res.status(200).json({
                        message: 'All answers received. Revealing answers and proceeding to next question in 15 seconds.',
                        correctAnswer: correct_answer,
                        isCorrect: isCorrect,
                        player: playerData
                    });
                }
                else {
                    res.status(200).json({
                        message: 'Answer submitted. Waiting for other players.',
                        isCorrect: isCorrect,
                        player: playerData
                    });
                }
            }
            catch (error) {
                console.error('Error submitting answer:', error);
                res.status(500).json({ error: 'Failed to submit answer due to server error' });
            }
        });
    }
    getActiveGames(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const query = `SELECT room_code, name, status, last_active FROM games WHERE status != 'ended'`;
                const result = yield this.db.query(query);
                if (result.rows.length === 0) {
                    res.status(404).json({ error: 'No active games found.' });
                    return;
                }
                res.status(200).json(result.rows);
            }
            catch (error) {
                console.error('Error fetching active games:', error);
                res.status(500).json({ error: 'Failed to fetch active games due to server error' });
            }
        });
    }
    getGameState(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                // Fetch game details
                const gameQuery = `SELECT * FROM games WHERE game_id = $1`;
                const gameResult = yield this.db.query(gameQuery, [id]);
                if (gameResult.rows.length === 0) {
                    res.status(404).json({ error: 'Game not found' });
                    return;
                }
                const game = gameResult.rows[0];
                // Fetch players associated with the game
                const playersQuery = `SELECT name, score, lives FROM players WHERE room_code = $1`;
                const playersResult = yield this.db.query(playersQuery, [game.room_code]);
                const players = playersResult.rows;
                res.status(200).json(Object.assign(Object.assign({}, game), { players }));
            }
            catch (error) {
                console.error('Error fetching game state:', error);
                res.status(500).json({ error: 'Failed to fetch game state due to server error' });
            }
        });
    }
    getPlayers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { roomCode } = req.params;
                if (!roomCode) {
                    res.status(400).json({ error: 'Room code is required' });
                    return;
                }
                const playersQuery = `SELECT name, score, lives FROM players WHERE room_code = $1`;
                const playersResult = yield this.db.query(playersQuery, [roomCode]);
                const players = playersResult.rows;
                res.status(200).json(players);
            }
            catch (error) {
                console.error('Error fetching players:', error);
                res.status(500).json({ error: 'Failed to fetch players due to server error' });
            }
        });
    }
    // Simpler method to get a question without complex fallback logic
    getQuestionForLevel(level) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`Attempting to get question for level ${level}`);
                const question = yield this.questionModel.getQuestionByLevel(level);
                if (question && question.id) {
                    console.log(`Successfully got question for level ${level}, ID: ${question.id}`);
                    return question;
                }
                // If we reach here, no question found for that level
                console.error(`No question found for level ${level}`);
                return null;
            }
            catch (error) {
                console.error('Error in getQuestionForLevel:', error);
                return null;
            }
        });
    }
}
exports.GameController = GameController;
