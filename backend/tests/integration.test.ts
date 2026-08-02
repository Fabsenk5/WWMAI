import dotenv from 'dotenv';

dotenv.config();

import request from 'supertest';
import fs from 'fs'; // Import fs for file reading
import path from 'path'; // Import path for resolving file path
// Import server and io instead of app
import { server, io } from '../src/app';
import pool from '../src/database/db';
import { checkAndSeedDatabase } from '../src/database/seed';
import { GameController } from '../src/controllers/gameController';
import { Server as MockSocketIOServer } from 'socket.io';
import { io as clientIo } from 'socket.io-client'; // Correct import for socket.io-client

// Ensure the mocked io instance has a close method
jest.mock('../src/app', () => {
    const { Server } = require('socket.io');
    const originalModule = jest.requireActual('../src/app');
    const mockIo = new Server();
    mockIo.close = jest.fn(() => Promise.resolve()); // Mock the close method
    return {
        ...originalModule,
        io: mockIo,
    };
});

// Mock the GameController to ensure io is passed
const gameController = new GameController(pool, io);

describe('API Integration Tests', () => {
    let createdRoomCode: string | null = null;
    let createdGameId: number | null = null;

    // Explicitly initialize and verify the io instance
    beforeAll(() => {
        if (!io) {
            throw new Error('Socket.IO instance is not initialized.');
        }
        console.log('Socket.IO instance initialized:', io);
    });

    // Reset database before all tests
    beforeAll(async () => {
        try {
            // 1. Read schema.sql
            // Correct path relative to the test file's location (__dirname)
            const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');

            // 2. Extract table names using a simple regex
            const tableNames: string[] = []; // Explicitly define the type as string[]
            const createTableRegex = /CREATE TABLE\s+(\w+)/gi; // Case-insensitive, global
            let match;
            while ((match = createTableRegex.exec(schemaSql)) !== null) {
                tableNames.push(match[1]);
            }

            // 3. Drop existing tables (in reverse order for safety, though CASCADE helps)
            const reversedTableNames = [...tableNames].reverse();
            console.log('Resetting test database tables:', reversedTableNames.join(', '));
            for (const tableName of reversedTableNames) {
                console.log(`Dropping table ${tableName}...`);
                // Ensure table names are properly quoted if they could be keywords or contain special chars
                // For simplicity, assuming standard names here. Use pg-format for robust quoting if needed.
                await pool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
            }

            // 4. Recreate tables from schema.sql
            console.log('Recreating tables from schema.sql...');
            await pool.query(schemaSql);
            console.log('Test database reset complete.');

            // Seed the database with questions and rooms
            console.log('Seeding the database with initial data...');
            await checkAndSeedDatabase();
            console.log('Database seeding complete.');

        } catch (error) {
            console.error('FATAL: Failed to reset and seed test database:', error);
            // Throw error to prevent tests from running with potentially incorrect DB state
            throw error;
        }
    });


    // Optional: Clean up created test data after all tests
    afterAll(async () => {
        // No need to delete specific game data if DB is reset before each run
        // if (createdGameId) { ... }

        await pool.end(); // Close the pool connection
        io.close();
        server.close(); // supertest typically handles server closing
    });

    it('should create a game', async () => {
        // Use server instead of app
        const response = await request(server)
            .post('/api/games/create')
            .send({ gameName: 'Integration Test Game', playerCount: 2 });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('gameId');
        expect(response.body).toHaveProperty('roomCode');

        // Store for subsequent tests
        createdGameId = response.body.gameId;
        createdRoomCode = response.body.roomCode;
        console.log(`Created game for testing: ID=${createdGameId}, RoomCode=${createdRoomCode}`);
    });

    // Ensure 'create game' runs first or handle dependency
    it('should join a game', async () => {
        // Ensure a game has been created
        if (!createdRoomCode) {
            throw new Error("Cannot run 'join game' test: No room code available from 'create game' test.");
        }

        // Use server instead of app
        const response = await request(server)
            .post('/api/games/join')
            .send({ roomCode: createdRoomCode, playerName: 'TestPlayer1' });

        console.log('Join Game Response:', response.body);
        // Expect 200 OK and a userId property upon successful join
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('userId');
    });

    // Ensure 'create game' runs first or handle dependency
    it('should start a game', async () => {
         // Ensure a game has been created
        if (!createdRoomCode || !createdGameId) {
            throw new Error("Cannot run 'start game' test: No room code or game ID available from 'create game' test.");
        }

        // Use server instead of app
        const response = await request(server)
            .post(`/api/games/${createdRoomCode}/start`) // Corrected endpoint
            .send({}); // No body needed as roomCode is in path

        console.log('Start Game Response:', response.body);
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Game started successfully');
        expect(response.body).toHaveProperty('firstQuestion'); // Check if the first question is returned
    });

    it('should fetch questions (general endpoint)', async () => {
        // Use server instead of app
        const response = await request(server).get('/api/games/questions');

        console.log('Fetch Questions Response:', response.body);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        // Add more specific checks if needed, e.g., expect(response.body.length).toBeGreaterThan(0);
    });

    // Ensure 'create game' runs first or handle dependency
    it('should fetch a game by ID with questions', async () => {
        // Ensure a game has been created
        if (!createdGameId) {
            throw new Error("Cannot run 'fetch game by ID' test: No game ID available from 'create game' test.");
        }

        // Use server instead of app
        const response = await request(server).get(`/api/games/${createdGameId}`); // Use the created game ID

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('game_id', createdGameId);
        expect(response.body).toHaveProperty('questions');
        // Check if the structure matches expectations (e.g., 15 questions with specific properties)
        expect(response.body.questions).toHaveLength(15);
        expect(response.body.questions[0]).toHaveProperty('difficulty', 'easy');
        expect(response.body.questions[14]).toHaveProperty('difficulty', 'hard');
        expect(response.body.questions[0]).toHaveProperty('prize', 50);
        expect(response.body.questions[14]).toHaveProperty('prize', 1000000);
        expect(response.body).toHaveProperty('players'); // Check if players array is present
    });

    // Add test for the new getGameState endpoint
    it('should fetch game state by ID', async () => {
        if (!createdGameId || !createdRoomCode) {
             throw new Error("Cannot run 'fetch game state' test: No game ID or room code available.");
        }
        // Optionally add a player first to test the players array in the state
        // Use server instead of app
        await request(server)
            .post('/api/games/join')
            .send({ roomCode: createdRoomCode, playerName: 'StateTestPlayer' });


        // Use server instead of app
        const response = await request(server).get(`/api/games/${createdGameId}/state`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('game_id', createdGameId);
        expect(response.body).toHaveProperty('room_code', createdRoomCode);
        expect(response.body).toHaveProperty('players');
        expect(Array.isArray(response.body.players)).toBe(true);
        // Check if the player added above is present
        expect(response.body.players.some((p: any) => p.name === 'StateTestPlayer')).toBe(true);
    });

    // Add test for getCurrentQuestion endpoint
    it('should fetch the current question for a started game', async () => {
        if (!createdRoomCode || !createdGameId) {
            throw new Error("Cannot run 'fetch current question' test: No room code or game ID available.");
        }

        // Ensure the game is started (it should be from the 'start game' test)
        // If tests don't run sequentially, you might need to start it here again.

        // Use server instead of app
        // Assign the result to the 'response' variable
        const response = await request(server).get(`/api/games/${createdRoomCode}/current-question`);

        // Correct the syntax for toBe
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('question');
        expect(response.body).toHaveProperty('level', 1); // Should be level 1 initially
        expect(response.body).toHaveProperty('prize');
        // IMPORTANT: The controller currently includes correct_answer here.
        // Decide if this is intended or should be removed for the actual game flow.
        expect(response.body).toHaveProperty('correct_answer');
    });

     // Add test for submitAnswer endpoint
     it('should submit an answer', async () => {
        // Check if createdRoomCode and createdGameId are accessible here
        if (!createdRoomCode || !createdGameId) {
            throw new Error("Cannot run 'submit answer' test: No room code or game ID available.");
        }

        // 1. Get the current question to know its ID and correct answer
        // Use server instead of app
        const questionResponse = await request(server).get(`/api/games/${createdRoomCode}/current-question`);
        expect(questionResponse.status).toBe(200);
        const currentQuestion = questionResponse.body;
        const questionId = currentQuestion.id;
        const correctAnswer = currentQuestion.correct_answer; // Need this for testing logic

        // 2. Get a userId (assuming 'TestPlayer1' joined earlier)
        // In a real scenario, you'd manage user sessions/tokens. Here, we might need to query the DB or modify joinGame response.
        // For simplicity, let's assume we know the player ID or query it.
        const playerResult = await pool.query('SELECT id FROM players WHERE room_code = $1 AND name = $2', [createdRoomCode, 'TestPlayer1']);
        if (playerResult.rows.length === 0) {
            throw new Error("Test setup error: Could not find player 'TestPlayer1'");
        }
        const userId = playerResult.rows[0].id;


        // 3. Submit the correct answer
        // Use server instead of app
        // Use the correct endpoint /:roomCode/submit-answer
        const submitResponse = await request(server)
            .post(`/api/games/${createdRoomCode}/submit-answer`) // Corrected endpoint
            .send({
                // roomCode is now in the path, not body
                userId: userId, // Use the actual user ID
                answer: correctAnswer // Submit the correct answer for this test case
            });

        expect(submitResponse.status).toBe(200);
        // The response message depends on whether all players have answered.
        expect(submitResponse.body.message).toMatch(/Answer submitted|All answers received/);

        // Optional: Submit an incorrect answer and verify
        // const incorrectAnswer = currentQuestion.incorrect_answers[0];
        // const submitIncorrectResponse = await request(server)
        //     .post(`/api/games/${createdRoomCode}/submit-answer`)
        //     .send({ userId: userId, answer: incorrectAnswer });
        // expect(submitIncorrectResponse.status).toBe(200);

    });

    it('should emit gameStarted event when a game starts', async () => {
        const roomCode = 'TEST123';

        // Mock the game creation and starting process
        await pool.query(`INSERT INTO games (name, player_count, room_code, status) VALUES ($1, $2, $3, $4)`, ['Test Game', 4, roomCode, 'pending']);

        const socket = clientIo(`http://localhost:${process.env.PORT || 5000}`); // Use clientIo for socket.io-client
        const gameStartedPromise = new Promise((resolve) => {
            socket.on('gameStarted', (data: any) => { // Add type annotation for data
                resolve(data);
            });
        });

        // Start the game
        await request(server).post(`/api/games/${roomCode}/start`).send();

        const gameStartedData = await gameStartedPromise;
        expect(gameStartedData).toEqual({ message: 'The game has started!' });

        socket.disconnect();
    });

    it('should emit newQuestion event when a new question is broadcasted', async () => {
        const roomCode = 'TEST123';

        // Mock the game creation and starting process
        await pool.query(`INSERT INTO games (name, player_count, room_code, status, current_level) VALUES ($1, $2, $3, $4, $5)`, ['Test Game', 4, roomCode, 'started', 1]);

        const socket = clientIo(`http://localhost:${process.env.PORT || 5000}`); // Use clientIo for socket.io-client
        const newQuestionPromise = new Promise((resolve) => {
            socket.on('newQuestion', (data: any) => { // Add type annotation for data
                resolve(data);
            });
        });

        // Trigger the next question
        await request(server).post(`/api/games/${roomCode}/start`).send();

        const newQuestionData = await newQuestionPromise;
        expect(newQuestionData).toHaveProperty('question');

        socket.disconnect();
    });

});