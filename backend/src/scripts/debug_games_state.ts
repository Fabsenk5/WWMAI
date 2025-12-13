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
        console.log('--- Debugging Games State ---');

        // 1. Get recent games (last 10)
        const gamesRes = await pool.query(`
            SELECT game_id, room_code, status, created_at, lives as game_lives_config, game_mode
            FROM games 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        console.log('Recent Games:');
        gamesRes.rows.forEach(g => console.log(g));

        // 2. Used ID Check for FabSen
        const userRes = await pool.query("SELECT id FROM users WHERE email = 'fabiank5@hotmail.com'");
        const fabId = userRes.rows[0]?.id;
        console.log('FabSen UserID:', fabId);

        // 3. For the recent games, check players
        if (gamesRes.rows.length > 0) {
            const roomCodes = gamesRes.rows.map(g => g.room_code);
            const playersRes = await pool.query(`
                SELECT userId, room_code, name, lives as current_lives, score 
                FROM players 
                WHERE room_code = ANY($1)
            `, [roomCodes]);

            console.log('Players in recent games:');
            playersRes.rows.forEach(p => {
                const isFab = String(p.userId) === String(fabId);
                console.log(`Room ${p.room_code}: User ${p.userid} (${p.name}) - Lives: ${p.current_lives}, Score: ${p.score} [Match Auth: ${isFab}]`);
            });
        }

    } catch (e: any) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
