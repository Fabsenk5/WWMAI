import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

async function run() {
    try {
        console.log('--- Debugging Category Stats ---');

        // 1. Check Questions Table Schema
        // Note: Using information_schema to see columns
        const schemaRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'questions';
        `);
        console.log('Questions Table Columns:', schemaRes.rows.map(r => r.column_name));

        // 2. Get User ID
        const userRes = await pool.query("SELECT id FROM users WHERE email = 'fabiank5@hotmail.com'");
        if (userRes.rows.length === 0) { console.log('User not found'); return; }
        const userId = userRes.rows[0].id;
        console.log('User ID:', userId);

        // 3. Check Player Answers
        const answersRes = await pool.query(`
            SELECT count(*) 
            FROM player_answers 
            WHERE user_id = $1
        `, [String(userId)]);
        console.log('Total Answers for User:', answersRes.rows[0].count);

        // 4. Test Category Stats Query (from AuthController)
        // Adjust 'q.id' or 'q.question_id' based on step 1 result manually if needed, 
        // but here we test the one in the code 'q.id' first.
        // If 'id' does not exist, this will throw error, which is good info.
        try {
            const catQuery = `
                SELECT q.category, 
                       COUNT(*) FILTER (WHERE pa.is_correct) as correct_count,
                       COUNT(*) FILTER (WHERE NOT pa.is_correct) as incorrect_count
                FROM player_answers pa
                JOIN questions q ON pa.question_id = q.id
                WHERE pa.user_id = $1
                GROUP BY q.category
            `;
            const statsRes = await pool.query(catQuery, [String(userId)]);
            console.log('Category Stats Result:', statsRes.rows);
        } catch (err: any) {
            console.error('Stats Query Failed (using q.id):', err.message);
            // Try with question_id
            console.log('Retrying with q.question_id...');
            const catQuery2 = `
                SELECT q.category, 
                       COUNT(*) FILTER (WHERE pa.is_correct) as correct_count,
                       COUNT(*) FILTER (WHERE NOT pa.is_correct) as incorrect_count
                FROM player_answers pa
                JOIN questions q ON pa.question_id = q.question_id
                WHERE pa.user_id = $1
                GROUP BY q.category
            `;
            const statsRes2 = await pool.query(catQuery2, [String(userId)]);
            console.log('Category Stats Result (q.question_id):', statsRes2.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
