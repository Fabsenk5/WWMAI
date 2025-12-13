
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs'; // Add fs

// Force load env
// Try multiple paths
const potentialPaths = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env')
];

let loaded = false;
for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
        console.log(`Found .env at ${p}`);
        dotenv.config({ path: p });
        loaded = true;
        break;
    }
}
if (!loaded) console.warn('Could not find .env file!');

import pool from '../database/db';

async function backfillCategories() {
    try {
        console.log('Starting category backfill for player_answers...');

        // Query to update player_answers with categories from questions table
        const query = `
            UPDATE player_answers pa
            SET category = q.category
            FROM questions q
            WHERE pa.question_id = q.id 
            AND pa.category IS NULL
        `;

        const result = await pool.query(query);
        console.log(`Backfill complete. Updated ${result.rowCount} rows.`);

    } catch (error) {
        console.error('Error backfilling categories:', error);
    } finally {
        await pool.end();
    }
}

backfillCategories();
