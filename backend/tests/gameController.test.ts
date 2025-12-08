import { GameController } from '../src/controllers/gameController';
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io'; // Import Socket.IO Server type
import request from 'supertest';
import { server } from '../src/app'; // Use named import for server
import pool from '../src/database/db';

console.log('Imported GameController:', GameController);

jest.mock('pg', () => {
    const mClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        connect: jest.fn().mockResolvedValue({ release: jest.fn() }),
        end: jest.fn(),
        on: jest.fn(), // Mock the 'on' method to avoid compatibility issues
    };
    return { Pool: jest.fn(() => mClient) };
});

// Refactor the mocked `Socket.IO` instance for TypeScript compatibility
const mockIo = {
    to: jest.fn(() => ({
        emit: jest.fn(),
    })),
    emit: jest.fn(),
} as unknown as jest.Mocked<SocketIOServer>;

describe('GameController Import Test', () => {
    it('should import GameController correctly', () => {
        expect(typeof GameController).toBe('function');
    });
});

describe('GameController', () => {
    let gameController: GameController;
    let mockDb: any;
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockDb = new Pool();
        // Pass the mocked pool and mocked io instance
        gameController = new GameController(mockDb, mockIo);
        mockReq = {};
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should create a game', async () => {
        mockReq.body = { gameName: 'Test Game', playerCount: 4 };
        // Match the controller's return value
        mockDb.query.mockResolvedValue({ rows: [{ game_id: 1, room_code: 'ABCD12' }] });

        await gameController.createGame(mockReq as Request, mockRes as Response);

        // Match the controller's query
        expect(mockDb.query).toHaveBeenCalledWith(
            'INSERT INTO games (name, player_count, room_code) VALUES ($1, $2, $3) RETURNING game_id, room_code',
            ['Test Game', 4, expect.any(String)]
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
        // Match the controller's response structure
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Game created successfully', gameId: 1, roomCode: 'ABCD12' });
    });

    it('should join a game', async () => {
        mockReq.body = { roomCode: '1234', playerName: 'Player1' };

        // Mock the sequence of queries the controller makes
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ player_count: 4 }] }) // Check room exists
            .mockResolvedValueOnce({ rows: [{ player_count: 0 }] }) // Check current player count
            .mockResolvedValueOnce({ rows: [{ userId: 'some-uuid-string' }] }); // Insert player

        await gameController.joinGame(mockReq as Request, mockRes as Response);

        // Check the SELECT queries were called
        expect(mockDb.query).toHaveBeenCalledWith(
            'SELECT player_count FROM games WHERE room_code = $1',
            ['1234']
        );
        expect(mockDb.query).toHaveBeenCalledWith(
            'SELECT COUNT(*) AS player_count FROM players WHERE room_code = $1',
            ['1234']
        );
        // Check the INSERT query
        expect(mockDb.query).toHaveBeenCalledWith(
            'INSERT INTO players (userId, room_code, name) VALUES ($1, $2, $3) RETURNING *',
            [expect.any(String), '1234', 'Player1']
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
        // Match the controller's response structure
        expect(mockRes.json).toHaveBeenCalledWith({ userId: 'some-uuid-string' });
    });

    it('should start a game', async () => {
        // Mock req.params for roomCode
        mockReq.params = { roomCode: '1234' };
        // Mock the database query for fetching the first question
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ question_id: 1, question: 'Q1?', level: 1 }] }) // Fetch first question
            .mockResolvedValueOnce({ rowCount: 1 }); // Update game status

        await gameController.startGame(mockReq as Request, mockRes as Response);

        // Verify UPDATE query
        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE games'),
            expect.arrayContaining([1, '1234']) // Expect question ID and room code
        );
        // Verify socket emit
        expect(mockIo.to).toHaveBeenCalledWith('1234');
        expect(mockIo.emit).toHaveBeenCalledWith('gameStarted', { message: 'The game has started!' });
        expect(mockIo.emit).toHaveBeenCalledWith('newQuestion', expect.any(Object));

        // Update the `should start a game` test to verify the order of emitted events
        expect(mockIo.emit.mock.calls[0]).toEqual(['newQuestion', expect.any(Object)]);
        expect(mockIo.emit.mock.calls[1]).toEqual(['gameStarted', { message: 'The game has started!' }]);
        
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Game started successfully' }));
    });

    it('should fetch questions', async () => {
        const mockQuestions = [
            { id: 1, category: 'Science', difficulty: 'easy', question: 'What is H2O?', correct_answer: 'Water', incorrect_answers: ['Oxygen', 'Hydrogen'] },
        ];
        mockDb.query.mockResolvedValue({ rows: mockQuestions });

        await gameController.getQuestions(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM questions');
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(mockQuestions);
    });

    it('should fetch a game by ID with questions', async () => {
        mockReq.params = { id: '1' };
        const mockGame = { game_id: 1, name: 'Test Game', player_count: 4, room_code: 'XYZ789', current_level: 1 }; // Added current_level
        const mockQuestionEasy = { question_id: 1, question: 'Q Easy 1?', difficulty: 'easy', level: 1, prize: 50 };
        const mockQuestionMedium = { question_id: 11, question: 'Q Medium 1?', difficulty: 'medium', level: 4, prize: 300 };
        const mockQuestionHard = { question_id: 21, question: 'Q Hard 1?', difficulty: 'hard', level: 8, prize: 4000 };
        const mockPlayers = [{ name: 'PlayerA', score: 0, lives: 3 }];

        // Define difficulty levels as in the controller
        const difficultyLevels = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard'];

        // Mock the sequence of queries precisely
        mockDb.query
            .mockResolvedValueOnce({ rows: [mockGame] }); // 1. Fetch game details

        // Mock the 15 question fetches based on difficultyLevels
        difficultyLevels.forEach((difficulty, index) => {
            let questionToReturn;
            if (difficulty === 'easy') questionToReturn = mockQuestionEasy;
            else if (difficulty === 'medium') questionToReturn = mockQuestionMedium;
            else questionToReturn = mockQuestionHard;
            // Adjust the mock to return a question matching the expected structure
            mockDb.query.mockResolvedValueOnce({ rows: [{ ...questionToReturn, question_id: index + 100 }] }); // Use unique IDs for mock questions
        });

        mockDb.query.mockResolvedValueOnce({ rows: mockPlayers }); // 17. Fetch players (after 1 game + 15 questions)

        await gameController.getGameById(mockReq as Request, mockRes as Response);

        // Verify the calls in order
        const calls = mockDb.query.mock.calls;

        // 1. Check game fetch query
        expect(calls[0][0]).toBe('SELECT * FROM games WHERE game_id = $1');
        expect(calls[0][1]).toEqual(['1']);

        // 2. Check the first question fetch query (level 1, easy)
        expect(calls[1][0]).toContain('SELECT * FROM questions');
        expect(calls[1][0]).toContain('WHERE difficulty = $1');
        expect(calls[1][1]).toEqual(['easy']);

        // Check a medium question fetch (e.g., level 4)
        expect(calls[4][1]).toEqual(['medium']);

        // Check a hard question fetch (e.g., level 8)
        expect(calls[8][1]).toEqual(['hard']);

        // 17. Check player fetch query (using the room_code from mockGame)
        expect(calls[16][0]).toBe('SELECT name, score, lives FROM players WHERE room_code = $1');
        expect(calls[16][1]).toEqual([mockGame.room_code]);

        expect(mockRes.status).not.toHaveBeenCalledWith(404);
        // Check the response structure including players and current_level
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                ...mockGame, // Includes current_level now
                questions: expect.any(Array),
                players: mockPlayers,
            })
        );
        // Optionally, check the structure of the questions array more deeply
        const responseJson = (mockRes.json as jest.Mock).mock.calls[0][0];
        expect(responseJson.questions.length).toBe(15); // Ensure 15 questions are returned
        expect(responseJson.questions).toEqual(expect.arrayContaining([expect.objectContaining({ level: 1, prize: 50 })]));
        expect(responseJson.questions).toEqual(expect.arrayContaining([expect.objectContaining({ level: 4, prize: 300 })]));
        expect(responseJson.questions).toEqual(expect.arrayContaining([expect.objectContaining({ level: 8, prize: 4000 })]));
    });

    it('should fetch game state by ID', async () => {
        mockReq.params = { id: '1' };

        const mockGame = {
            game_id: 1,
            name: 'Test Game',
            player_count: 4,
            room_code: 'ABCD12',
            status: 'started',
            current_level: 1,
        };

        const mockPlayers = [
            { name: 'Player1', score: 100, lives: 3 },
            { name: 'Player2', score: 80, lives: 2 },
        ];

        mockDb.query
            .mockResolvedValueOnce({ rows: [mockGame] }) // Game details
            .mockResolvedValueOnce({ rows: mockPlayers }); // Players

        await gameController.getGameState(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM games WHERE game_id = $1', ['1']);
        expect(mockDb.query).toHaveBeenCalledWith('SELECT name, score, lives FROM players WHERE room_code = $1', ['ABCD12']);
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({
            ...mockGame,
            players: mockPlayers,
        });
    });
});

describe('joinGame API', () => {
    beforeAll(async () => {
        // Ensure the database is clean before tests
        await pool.query('TRUNCATE TABLE players RESTART IDENTITY CASCADE;');
        await pool.query('TRUNCATE TABLE games RESTART IDENTITY CASCADE;');
    });

    afterAll(async () => {
        // Close the database connection after tests
        await pool.end();
    });

    it('should generate a new userId for a new player', async () => {
        // Create a new game
        const gameResponse = await request(server)
            .post('/api/games/create')
            .send({ gameName: 'Test Game', playerCount: 4 });

        const roomCode = gameResponse.body.roomCode;

        // Join the game with a new player
        const joinResponse = await request(server)
            .post('/api/games/join')
            .send({ roomCode, playerName: 'Player1' });

        expect(joinResponse.status).toBe(200);
        expect(joinResponse.body.userId).toBeDefined();

        // Verify the userId is stored in the database
        const userId = joinResponse.body.userId;
        const dbResult = await pool.query('SELECT * FROM players WHERE userId = $1', [userId]);
        expect(dbResult.rows.length).toBe(1);
        expect(dbResult.rows[0].name).toBe('Player1');
    });

    it('should return the existing userId for an existing player', async () => {
        // Create a new game
        const gameResponse = await request(server)
            .post('/api/games/create')
            .send({ gameName: 'Test Game', playerCount: 4 });

        const roomCode = gameResponse.body.roomCode;

        // Join the game with a new player
        const joinResponse1 = await request(server)
            .post('/api/games/join')
            .send({ roomCode, playerName: 'Player1' });

        const userId = joinResponse1.body.userId;

        // Join the game again with the same player
        const joinResponse2 = await request(server)
            .post('/api/games/join')
            .send({ roomCode, playerName: 'Player1', userId });

        expect(joinResponse2.status).toBe(200);
        expect(joinResponse2.body.userId).toBe(userId);
    });
});