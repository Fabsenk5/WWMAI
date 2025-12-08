
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, 'src', '.env') });
// Fallback if that path doesn't work (depending on where script is run)
if (!process.env.DB_HOST) {
    dotenv.config({ path: path.resolve(__dirname, '.env') });
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'wwmai',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const migrate = async () => {
    try {
        console.log('Running migration: Adding jokers_used to players table...');

        // Check if column exists strictly to avoid errors, or just use IF NOT EXISTS if PG version supports it (safest is try/catch or strict check)
        // We'll proceed with simple ALTER TABLE ADD COLUMN IF NOT EXISTS

        await pool.query(`
      ALTER TABLE players 
      ADD COLUMN IF NOT EXISTS jokers_used TEXT[] DEFAULT '{}';
    `);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
};

migrate();
