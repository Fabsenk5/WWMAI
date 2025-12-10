
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { AiService } from '../services/aiService';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runBackfill() {
    console.log('Starting translation backfill...');
    const aiService = new AiService(db);

    // Backfill up to 100 questions per run
    await aiService.backfillTranslations(100);

    console.log('Backfill script finished.');
    await db.end();
}

runBackfill().catch(console.error);
