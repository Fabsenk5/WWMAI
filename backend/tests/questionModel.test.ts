import { QuestionModel } from '../src/models/questionModel';
import { Pool } from 'pg';

jest.mock('pg', () => {
    const mClient = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
    };
    return { Pool: jest.fn(() => mClient) };
});

describe('QuestionModel', () => {
    let questionModel: QuestionModel;
    let mockDb: any;

    beforeEach(() => {
        mockDb = new Pool();
        questionModel = new QuestionModel(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should fetch all questions', async () => {
        const mockQuestions = [
            { id: 1, category: 'Science', difficulty: 'easy', question: 'What is H2O?', correct_answer: 'Water', incorrect_answers: ['Oxygen', 'Hydrogen'] },
        ];
        mockDb.query.mockResolvedValue({ rows: mockQuestions });

        const result = await questionModel.find();

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM questions');
        expect(result).toEqual(mockQuestions.map(q => ({
            ...q
        })));
    });

    it('should fetch questions by difficulty', async () => {
        const mockQuestions = [
            { id: 1, category: 'Science', difficulty: 'easy', question: 'What is H2O?', correct_answer: 'Water', incorrect_answers: ['Oxygen', 'Hydrogen'] },
        ];
        mockDb.query.mockResolvedValue({ rows: mockQuestions });

        const result = await questionModel.getQuestionsByDifficulty('easy', [], 1);

        expect(mockDb.query).toHaveBeenCalledWith(
            'SELECT * FROM questions WHERE is_active = true AND difficulty = $1 ORDER BY RANDOM() LIMIT $2',
            ['easy', 1]
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject(mockQuestions[0]);
    });

    it('should fetch a question by ID', async () => {
        const mockQuestion = { id: 1, category: 'Science', difficulty: 'easy', question: 'What is H2O?', correct_answer: 'Water', incorrect_answers: ['Oxygen', 'Hydrogen'] };
        mockDb.query.mockResolvedValue({ rows: [mockQuestion] });

        const result = await questionModel.getQuestionById(1);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM questions WHERE id = $1', [1]);
        expect(result).toMatchObject(mockQuestion);
    });
});