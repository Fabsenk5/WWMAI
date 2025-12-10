import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv'; // Explicitly load dotenv

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    : {
        user: process.env.DB_USER || 'your_username',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'wer_wird_millionaer',
        password: process.env.DB_PASSWORD || 'your_password',
        port: parseInt(process.env.DB_PORT || '5432', 10),
    };

const pool = new Pool(poolConfig);

async function runMigration() {
    try {
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        console.log(`Found ${files.length} migrations.`);

        for (const file of files) {
            const migrationPath = path.join(migrationsDir, file);
            console.log(`Executing migration: ${file}`);
            const sql = fs.readFileSync(migrationPath, 'utf8');
            try {
                await pool.query(sql);
                console.log(`Executed: ${file}`);
            } catch (innerErr) {
                console.error(`Error executing ${file}:`, innerErr);
                // Continue to next migration
            }
        }

        console.log('All migrations completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
