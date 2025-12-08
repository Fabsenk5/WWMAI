import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, 'src', '.env') });
// Also try default .env location
dotenv.config();

const client = new Client({
    user: process.env.DB_USER || 'Admin',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'wwmai',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to database');

        await client.query(`
            ALTER TABLE games 
            ADD COLUMN IF NOT EXISTS selected_categories TEXT[] DEFAULT NULL;
        `);

        console.log('Migration successful: added selected_categories to games table');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await client.end();
    }
}

migrate();
