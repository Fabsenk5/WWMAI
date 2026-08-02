import pool from './db';
import * as fs from 'fs';
import * as path from 'path';

const questions = [
    // Easy questions
    { category: 'Math', question: 'What is 2 + 2?', correct_answer: '4', incorrect_answers: ['3', '5', '6'], difficulty: 'easy' },
    { category: 'Geography', question: 'What is the capital of France?', correct_answer: 'Paris', incorrect_answers: ['London', 'Berlin', 'Madrid'], difficulty: 'easy' },
    { category: 'Science', question: 'What color is the sky on a clear day?', correct_answer: 'Blue', incorrect_answers: ['Green', 'Red', 'Yellow'], difficulty: 'easy' },
    { category: 'Opposites', question: 'What is the opposite of hot?', correct_answer: 'Cold', incorrect_answers: ['Warm', 'Cool', 'Hotter'], difficulty: 'easy' },
    { category: 'Math', question: 'What is 5 + 3?', correct_answer: '8', incorrect_answers: ['7', '9', '10'], difficulty: 'easy' },
    { category: 'Geography', question: 'What is the capital of Germany?', correct_answer: 'Berlin', incorrect_answers: ['Munich', 'Hamburg', 'Frankfurt'], difficulty: 'easy' },
    { category: 'Nature', question: 'What is the color of grass?', correct_answer: 'Green', incorrect_answers: ['Blue', 'Yellow', 'Red'], difficulty: 'easy' },
    { category: 'Math', question: 'What is 10 - 4?', correct_answer: '6', incorrect_answers: ['5', '7', '8'], difficulty: 'easy' },
    { category: 'Geography', question: 'What is the capital of Italy?', correct_answer: 'Rome', incorrect_answers: ['Venice', 'Milan', 'Naples'], difficulty: 'easy' },
    { category: 'Math', question: 'What is 3 x 3?', correct_answer: '9', incorrect_answers: ['6', '8', '12'], difficulty: 'easy' },

    // Medium questions
    { category: 'Math', question: 'What is the square root of 16?', correct_answer: '4', incorrect_answers: ['3', '5', '6'], difficulty: 'medium' },
    { category: 'Literature', question: 'Who wrote "To Kill a Mockingbird"?', correct_answer: 'Harper Lee', incorrect_answers: ['Mark Twain', 'J.K. Rowling', 'Ernest Hemingway'], difficulty: 'medium' },
    { category: 'Science', question: 'What is the chemical symbol for water?', correct_answer: 'H2O', incorrect_answers: ['O2', 'CO2', 'H2'], difficulty: 'medium' },
    { category: 'Geography', question: 'What is the capital of Japan?', correct_answer: 'Tokyo', incorrect_answers: ['Osaka', 'Kyoto', 'Nagoya'], difficulty: 'medium' },
    { category: 'Math', question: 'What is 12 x 12?', correct_answer: '144', incorrect_answers: ['121', '132', '156'], difficulty: 'medium' },
    { category: 'Art', question: 'Who painted the Mona Lisa?', correct_answer: 'Leonardo da Vinci', incorrect_answers: ['Vincent van Gogh', 'Pablo Picasso', 'Claude Monet'], difficulty: 'medium' },
    { category: 'Astronomy', question: 'What is the largest planet in our solar system?', correct_answer: 'Jupiter', incorrect_answers: ['Saturn', 'Earth', 'Mars'], difficulty: 'medium' },
    { category: 'Science', question: 'What is the boiling point of water in Celsius?', correct_answer: '100', incorrect_answers: ['90', '110', '120'], difficulty: 'medium' },
    { category: 'Geography', question: 'What is the capital of Canada?', correct_answer: 'Ottawa', incorrect_answers: ['Toronto', 'Vancouver', 'Montreal'], difficulty: 'medium' },
    { category: 'Science', question: 'What is the chemical symbol for gold?', correct_answer: 'Au', incorrect_answers: ['Ag', 'Pb', 'Fe'], difficulty: 'medium' },

    // Hard questions
    { category: 'Physics', question: 'What is the speed of light in vacuum?', correct_answer: '299,792 km/s', incorrect_answers: ['150,000 km/s', '1,000,000 km/s', '3,000 km/s'], difficulty: 'hard' },
    { category: 'Physics', question: 'Who developed the theory of relativity?', correct_answer: 'Albert Einstein', incorrect_answers: ['Isaac Newton', 'Galileo Galilei', 'Nikola Tesla'], difficulty: 'hard' },
    { category: 'Geography', question: 'What is the capital of Australia?', correct_answer: 'Canberra', incorrect_answers: ['Sydney', 'Melbourne', 'Brisbane'], difficulty: 'hard' },
    { category: 'Math', question: 'What is the smallest prime number?', correct_answer: '2', incorrect_answers: ['1', '3', '5'], difficulty: 'hard' },
    { category: 'Science', question: 'What is the chemical symbol for sodium?', correct_answer: 'Na', incorrect_answers: ['S', 'N', 'K'], difficulty: 'hard' },
    { category: 'Medicine', question: 'Who discovered penicillin?', correct_answer: 'Alexander Fleming', incorrect_answers: ['Marie Curie', 'Louis Pasteur', 'Gregor Mendel'], difficulty: 'hard' },
    { category: 'Geography', question: 'What is the capital of South Africa?', correct_answer: 'Pretoria', incorrect_answers: ['Cape Town', 'Johannesburg', 'Durban'], difficulty: 'hard' },
    { category: 'Chemistry', question: 'What is the atomic number of carbon?', correct_answer: '6', incorrect_answers: ['12', '8', '4'], difficulty: 'hard' },
    { category: 'Geography', question: 'What is the largest desert in the world?', correct_answer: 'Sahara', incorrect_answers: ['Gobi', 'Kalahari', 'Arctic'], difficulty: 'hard' },
    { category: 'Geography', question: 'What is the capital of Brazil?', correct_answer: 'Brasília', incorrect_answers: ['Rio de Janeiro', 'São Paulo', 'Salvador'], difficulty: 'hard' },
];

const rooms = [
    { last_activity: new Date(Date.now() - 10 * 60 * 1000) }, // 10 minutes ago
    { last_activity: new Date(Date.now() - 2 * 60 * 1000) },  // 2 minutes ago
];

async function createTables() {
    console.log('Creating tables from schema.sql...');
    try {
        // Resolve path to schema.sql. 
        // Assuming running from backend root: ./database/schema.sql
        // We check standard backend path and also a relative check just in case.
        const possiblePaths = [
            path.join(process.cwd(), 'database', 'schema.sql'),
            path.join(__dirname, 'schema.sql'),
            path.join(__dirname, '..', '..', 'database', 'schema.sql')
        ];

        let schemaPath = possiblePaths.find(p => fs.existsSync(p));

        if (!schemaPath) {
            console.log(`Schema file not found in: ${possiblePaths.join(', ')}`);
            throw new Error(`Schema file not found.`);
        }

        console.log(`Reading schema from: ${schemaPath}`);
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schemaSql);
        console.log('Tables created successfully.');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}

async function seedQuestions() {
    console.log('Seeding questions...');

    for (const question of questions) {
        const query = `
            INSERT INTO questions (category, question, correct_answer, incorrect_answers, difficulty)
            VALUES ($1, $2, $3, $4::text[], $5)
            ON CONFLICT ON CONSTRAINT unique_question DO NOTHING
        `;
        const values = [
            question.category,
            question.question,
            question.correct_answer,
            question.incorrect_answers,
            question.difficulty,
        ];
        await pool.query(query, values);
    }
    console.log('Questions seeded successfully');
}

async function verifyQuestions() {
    const result = await pool.query('SELECT COUNT(*) AS count FROM questions');
    console.log(`Number of questions in the database: ${result.rows[0].count}`);
}

async function seedRooms() {
    // Clear the rooms table first
    console.log('Clearing rooms table...');
    await pool.query('DELETE FROM rooms');
    console.log('Rooms table cleared.');

    for (const room of rooms) {
        const query = `
            INSERT INTO rooms (last_activity)
            VALUES ($1)
        `;
        const values = [room.last_activity];
        await pool.query(query, values);
    }
    console.log('Rooms seeded successfully');
}

async function seedGames() {
    console.log('Seeding games...');

    // Clear the games and game_questions tables first
    await pool.query('DELETE FROM game_questions');
    await pool.query('DELETE FROM games');
    console.log('Games and game_questions tables cleared.');

    // Insert a test game with roomCode '70PCPN'
    const gameQuery = `
        INSERT INTO games (name, player_count, room_code, status, current_level, current_question_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING game_id
    `;
    const gameValues = ['Test Game', 4, '70PCPN', 'pending', 1, null];
    const gameResult = await pool.query(gameQuery, gameValues);
    const gameId = gameResult.rows[0].game_id;

    // Update references to `id` with the new identifiers like `question_id` and `game_id`
    const questionIdsResult = await pool.query('SELECT id FROM questions LIMIT 15');
    const questionIds = questionIdsResult.rows.map(row => row.id);

    for (const questionId of questionIds) {
        const gameQuestionQuery = `
            INSERT INTO game_questions (game_id, question_id)
            VALUES ($1, $2)
        `;
        await pool.query(gameQuestionQuery, [gameId, questionId]);
    }

    console.log('Games and associated questions seeded successfully.');
}

async function ensureSchemaUpdates() {
    console.log('Verifying schema updates...');
    try {
        // Migration: Add selected_categories to games if it doesn't exist
        await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS selected_categories TEXT[]');
        await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS wait_time INT DEFAULT 15');
        console.log('Schema verified/updated: games.selected_categories checked.');
    } catch (err: any) {
        // Ignore "relation does not exist" error, as verify/seed logic will handle creation
        if (err.code === '42P01' || err.message.includes('does not exist')) {
            console.log('Skipping schema update because tables do not exist yet.');
        } else {
            console.warn('Error verifying schema updates:', err);
        }
    }
}

export async function checkAndSeedDatabase() {
    console.log('Checking database status...');
    try {
        // Run migrations first (in case table exists but is old)
        await ensureSchemaUpdates();

        // Try to access the questions table
        const result = await pool.query('SELECT 1 FROM questions LIMIT 1');

        // If table exists, check if it has data
        const countResult = await pool.query('SELECT COUNT(*) FROM questions');
        const count = parseInt(countResult.rows[0].count, 10);

        if (count === 0) {
            console.log('Database tables exist but are empty. Seeding data...');
            await seedQuestions();
            await verifyQuestions();
            await seedRooms();
            await seedGames();
            console.log('Database seeded successfully.');
        } else {
            console.log(`Database already contains ${count} questions. Skipping seed.`);
        }

    } catch (error: any) {
        // If error is "relation does not exist" (code 42P01), we need to create tables
        if (error.code === '42P01' || error.message.includes('does not exist')) {
            console.log('Database tables not found. Initializing schema...');
            await createTables();
            console.log('Schema initialized. Seeding data...');
            await seedQuestions();
            await verifyQuestions();
            await seedRooms();
            await seedGames();
            console.log('Database initialized and seeded successfully.');
        } else {
            console.error('Error checking/seeding database:', error);
        }
    }
}