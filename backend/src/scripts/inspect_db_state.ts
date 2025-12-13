
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
// Force load env
const potentialPaths = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env')
];
for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
        console.log(`Loading env from ${p}`);
        dotenv.config({ path: p });
        break;
    }
}

// Import pool after env is loaded
const pool = require('../database/db').default;

async function inspectDb() {
    try {
        console.log('--- DB INSPECTION START ---');

        // 1. Check Row Counts
        const paCount = await pool.query('SELECT COUNT(*) FROM player_answers');
        console.log(`player_answers count: ${paCount.rows[0].count}`);

        // 2. Sample Rows
        const paSample = await pool.query('SELECT id, user_id, category, room_code FROM player_answers LIMIT 5');
        console.log('Sample player_answers:', paSample.rows);

        // 3. Check Constraints (Foreign Keys) for player_answers
        const fkQuery = `
            SELECT
                tc.table_schema, 
                tc.constraint_name, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                rc.delete_rule 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
                JOIN information_schema.referential_constraints AS rc
                  ON rc.constraint_name = tc.constraint_name
            WHERE tc.table_name = 'player_answers';
        `;
        const fkRes = await pool.query(fkQuery);
        console.log('Foreign Keys on player_answers:', fkRes.rows);

        // 4. Check if games table exists and has rows
        const gamesCount = await pool.query('SELECT COUNT(*) FROM games');
        console.log(`games count: ${gamesCount.rows[0].count}`);

    } catch (err) {
        console.error('Inspection Failed:', err);
    } finally {
        await pool.end();
    }
}

inspectDb();
