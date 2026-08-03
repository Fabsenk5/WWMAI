import { GameController } from '../src/controllers/gameController';
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';

// Each Pool instantiation gets a fresh mock client so app.ts and unit tests
// never share mock state.
jest.mock('pg', () => {
    const createClient = () => ({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        connect: jest.fn().mockImplementation(() => Promise.resolve({
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        })),
        end: jest.fn(),
        on: jest.fn(),
    });
    return { Pool: jest.fn(() => createClient()) };
});

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
        mockDb.query
            .mockResolvedValueOnce({
                rows: [
                    { key: 'global_premium_unlocked', value: 'false' },
                    { key: 'global_guest_premium_unlocked', value: 'false' },
                ],
            }) // system_settings
            .mockResolvedValueOnce({ rows: [] }) // room code availability check
            .mockResolvedValueOnce({ rows: [{ game_id: 1, room_code: 'ABCD12' }] }); // insert

        await gameController.createGame(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO games (name, player_count, room_code, game_mode, lives, selected_categories, wait_time, host_id, difficulty_mode, moderator_mode)'),
            expect.arrayContaining(['Test Game', 4])
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Game created successfully', gameId: 1, roomCode: 'ABCD12' });
    });

    it('should join a game', async () => {
        mockReq.body = { roomCode: '1234', userName: 'Player1' };

        mockDb.query
            .mockResolvedValueOnce({ rows: [{ player_count: 4, lives: 3, game_mode: 'cooperative' }] }) // Room lookup
            .mockResolvedValueOnce({ rows: [{ user_count: 0 }] }) // Current player count
            .mockResolvedValueOnce({ rowCount: 0 }) // DELETE old player rows
            .mockResolvedValueOnce({ rows: [{ userid: 'some-uuid-string' }] }); // INSERT player

        await gameController.joinGame(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith(
            'SELECT player_count, lives, game_mode FROM games WHERE room_code = $1',
            ['1234']
        );
        expect(mockDb.query).toHaveBeenCalledWith(
            'SELECT COUNT(*) AS user_count FROM players WHERE room_code = $1',
            ['1234']
        );
        expect(mockDb.query).toHaveBeenCalledWith(
            'INSERT INTO players (userId, room_code, name, lives) VALUES ($1, $2, $3, $4) RETURNING *',
            [expect.any(String), '1234', 'Player1', 3]
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({ userId: 'some-uuid-string' });
    });

    it('should start a game', async () => {
        mockReq.params = { roomCode: '1234' };

        // Question fetch goes through the pool (questionModel), everything else through a transaction client
        (mockDb.query as jest.Mock).mockResolvedValue({
            rows: [{
                id: 1,
                question_id: 1,
                question: 'Q1?',
                category: 'Science',
                difficulty: 'easy',
                correct_answer: 'A',
                incorrect_answers: ['B', 'C', 'D'],
                translations: {},
            }],
        });

        const client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        (mockDb.connect as jest.Mock).mockResolvedValue(client);
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ game_id: 1, status: 'pending', selected_categories: null, difficulty_mode: 'standard' }] }) // Game check
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE games
            .mockResolvedValueOnce({ rows: [] }); // COMMIT

        await gameController.startGame(mockReq as Request, mockRes as Response);

        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE games'), expect.any(Array));
        expect(mockIo.to).toHaveBeenCalledWith('1234');
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Game started successfully' }));
    });

    it('should fetch questions (admin password required)', async () => {
        const mockQuestions = [
            { id: 1, category: 'Science', difficulty: 'easy', question: 'What is H2O?', correct_answer: 'Water', incorrect_answers: ['Oxygen', 'Hydrogen'] },
        ];
        mockDb.query.mockResolvedValue({ rows: mockQuestions });
        mockReq.query = { password: process.env.ADMIN_PASSWORD || 'admin' };

        await gameController.getQuestions(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM questions');
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(mockQuestions);
    });

    it('should reject question bank fetch without password', async () => {
        mockReq.query = {};
        mockRes.status = jest.fn().mockReturnThis();
        mockRes.json = jest.fn();

        await gameController.getQuestions(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should fetch a game by ID with players (room_code first)', async () => {
        mockReq.params = { id: '1' };
        const mockGame = { game_id: 1, name: 'Test Game', player_count: 4, room_code: 'XYZ789', current_level: 1 };
        const mockPlayers = [{ name: 'PlayerA', score: 0, lives: 3 }];

        mockDb.query
            .mockResolvedValueOnce({ rows: [mockGame] })
            .mockResolvedValueOnce({ rows: mockPlayers });

        await gameController.getGameById(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM games WHERE room_code = $1', ['1']);
        expect(mockDb.query).toHaveBeenCalledWith('SELECT name, score, lives, jokers_used FROM players WHERE room_code = $1', ['XYZ789']);
        expect(mockRes.status).not.toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ ...mockGame, players: mockPlayers });
    });

    it('should fall back to game_id lookup when room_code misses (numeric IDs)', async () => {
        mockReq.params = { id: '5' };
        const mockGame = { game_id: 5, name: 'Fallback Game', player_count: 4, room_code: 'ABC123', current_level: 1 };
        const mockPlayers = [{ name: 'PlayerB', score: 0, lives: 3 }];

        mockDb.query
            .mockResolvedValueOnce({ rows: [] }) // room_code miss
            .mockResolvedValueOnce({ rows: [mockGame] }) // game_id hit
            .mockResolvedValueOnce({ rows: mockPlayers });

        await gameController.getGameById(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM games WHERE room_code = $1', ['5']);
        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM games WHERE game_id = $1', ['5']);
        expect(mockRes.status).not.toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ ...mockGame, players: mockPlayers });
    });

    it('should leave a game', async () => {
        mockReq.params = { roomCode: '1234' };
        mockReq.body = { userId: 'player-1' };

        mockDb.query
            .mockResolvedValueOnce({ rowCount: 1, rows: [{ name: 'Player1' }] }) // DELETE player
            .mockResolvedValueOnce({ rowCount: 1 }); // user_count sync

        await gameController.leaveGame(mockReq as Request, mockRes as Response);

        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM players WHERE userId = $1 AND room_code = $2 RETURNING name',
            ['player-1', '1234']
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Player left the game' });
    });

    it('should 404 when leaving a room as a non-member', async () => {
        mockReq.params = { roomCode: '1234' };
        mockReq.body = { userId: 'ghost' };
        mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

        await gameController.leaveGame(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should switch the question and emit questionSwitched', async () => {
        mockReq.params = { roomCode: '1234' };
        mockReq.body = { userId: 'player-1', jokerType: 'switch' };

        const oldQuestion = { id: 10, category: 'Science', difficulty: 'easy', question: 'Old Q?', correct_answer: 'A', incorrect_answers: ['B', 'C', 'D'], translations: {} };
        const newQuestion = { id: 11, category: 'Science', difficulty: 'easy', question: 'New Q?', correct_answer: 'X', incorrect_answers: ['Y', 'Z', 'W'], translations: {} };

        mockDb.query
            .mockResolvedValueOnce({
                rows: [{
                    game_id: 5, current_question_id: 10, current_level: 3, game_mode: 'cooperative',
                    team_jokers: [], team_5050_removed: [], selected_categories: null,
                    difficulty_mode: 'standard', wait_time: 15, player_count: 2, lives: 3,
                }],
            }) // gameQuery
            .mockResolvedValueOnce({ rows: [oldQuestion] }) // questionQuery
            .mockResolvedValueOnce({ rows: [] }) // used answers
            .mockResolvedValue({ rows: [newQuestion] }); // questionModel fetch + updates

        await gameController.useJoker(mockReq as Request, mockRes as Response);

        // questionSwitched broadcast with the fresh question
        expect(mockIo.to).toHaveBeenCalledWith('1234');
        const roomEmit = (mockIo.to as jest.Mock).mock.results[0].value;
        expect(roomEmit.emit).toHaveBeenCalledWith('questionSwitched', expect.objectContaining({ id: 11 }));
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ switched: true, jokerType: 'switch' }));
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
        expect(mockDb.query).toHaveBeenCalledWith('SELECT name, score, lives, jokers_used FROM players WHERE room_code = $1', ['ABCD12']);
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({
            ...mockGame,
            players: mockPlayers,
        });
    });
});
