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
        console.log('--- Cleaning Up Zombie Games ---');

        // Find started games older than 2 hours (safeguard) or simplify to "all started games" for dev dev?
        // Let's just end ALL started games to be clean for testing.
        const res = await pool.query(`
            UPDATE games 
            SET status = 'ended' 
            WHERE status = 'started'
            RETURNING game_id, room_code;
        `);

        console.log(`Ended ${res.rowCount} games:`);
        res.rows.forEach(g => console.log(`- ${g.room_code} (ID: ${g.game_id})`));

    } catch (e: any) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
