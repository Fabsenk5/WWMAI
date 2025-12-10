
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { AiService } from '../services/aiService';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
    };

const db = new Pool(poolConfig);

async function runBackfill() {
    console.log('Starting translation backfill...');
    const aiService = new AiService(db);

    // Backfill up to 100 questions per run
    await aiService.backfillTranslations(100);

    console.log('Backfill script finished.');
    await db.end();
}

runBackfill().catch(console.error);
