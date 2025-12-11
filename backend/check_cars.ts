
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkQuestion() {
    try {
        const res = await pool.query("SELECT difficulty, COUNT(*) FROM questions WHERE category = 'Cars' GROUP BY difficulty");
        console.log('Cars Category Distribution:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkQuestion();
