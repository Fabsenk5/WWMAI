import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER || 'admin',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'wer-wird-millionaer',
    password: process.env.DB_PASSWORD || 'admin',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function runMigration() {
    try {
        console.log('Running migration...');
        const sql = "ALTER TABLE games ADD COLUMN IF NOT EXISTS difficulty_mode VARCHAR(20) DEFAULT 'standard';";
        await pool.query(sql);
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
