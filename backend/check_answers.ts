
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkCount() {
    try {
        const res = await pool.query("SELECT COUNT(*) FROM player_answers");
        console.log('Player Answers Count:', res.rows[0].count);

        const res2 = await pool.query("SELECT room_code, COUNT(DISTINCT question_id) as q_count FROM player_answers GROUP BY room_code ORDER BY q_count DESC LIMIT 5");
        console.log('Top Rooms by Question Count:', res2.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkCount();
