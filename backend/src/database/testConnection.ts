import { Pool } from 'pg';

const dbConnectionString = `postgresql://your_username:your_password@localhost:5432/wer_wird_millionaer`;
const pool = new Pool({ connectionString: dbConnectionString });

async function testGameQuestions() {
    try {
        console.log('Testing game_questions table...');
        const result = await pool.query(`
            SELECT gq.game_id, gq.question_id, q.question
            FROM game_questions gq
            JOIN questions q ON gq.question_id = q.id
        `);
        console.log('game_questions table contents:', result.rows);
    } catch (error) {
        console.error('Error querying game_questions table:', error);
    } finally {
        await pool.end();
    }
}

testGameQuestions();