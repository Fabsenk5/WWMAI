
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force load env
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

import pool from '../database/db';

async function debugStats() {
    try {
        console.log('--- USERS ---');
        const users = await pool.query('SELECT id, username, email, games_played FROM users LIMIT 5');
        fs.writeFileSync('debug_output.txt', JSON.stringify(users.rows, null, 2) + '\n\n');

        if (users.rows.length > 0) {
            // Find User ID 1
            const user1 = users.rows.find(u => u.id === 1);
            const userId = user1 ? user1.id : users.rows[0].id;

            fs.appendFileSync('debug_output.txt', `User ID: ${userId} (Type: ${typeof userId})\n\n`);

            // Check raw table content
            const answers = await pool.query('SELECT * FROM player_answers LIMIT 5');
            fs.appendFileSync('debug_output.txt', 'Sample raw answers:\n' + JSON.stringify(answers.rows, null, 2) + '\n\n');

            // ... query test
            const catQuery = `
                SELECT q.category, 
                       COUNT(*) FILTER (WHERE pa.is_correct) as correct_count,
                       COUNT(*) FILTER (WHERE NOT pa.is_correct) as incorrect_count
                FROM player_answers pa
                JOIN questions q ON pa.question_id = q.id
                WHERE pa.user_id = $1::text
                GROUP BY q.category
            `;
            // Try with integer (cast to text in query)
            try {
                const resInt = await pool.query(catQuery, [userId]);
                fs.appendFileSync('debug_output.txt', 'Result (Int param): ' + JSON.stringify(resInt.rows, null, 2) + '\n\n');
            } catch (e: any) {
                fs.appendFileSync('debug_output.txt', 'Error (Int param): ' + e.message + '\n\n');
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debugStats();
