import pool from './db';
import { AiService } from '../services/aiService';

// Periodischer Pool-Füller (1x/24h, in app.ts getaktet zusammen mit dem
// Similarity-Cleanup): Kategorien unter dem Ziel-Pool werden automatisch
// aufgefüllt (ensureCategoryPool respektiert den 6h-Cooldown, sodass sich
// Game-Erstellungs- und Job-Generierungen nicht stapeln).

const POOL_TARGET = 150;

export async function fillQuestionPools(): Promise<void> {
    console.log('[PoolFill] Checking question pools...');
    try {
        const res = await pool.query(
            `SELECT category, COUNT(*) AS cnt
             FROM questions
             WHERE is_active = true AND category IS NOT NULL
             GROUP BY category
             ORDER BY cnt ASC`
        );
        const aiService = new AiService(pool);

        for (const row of res.rows) {
            const count = parseInt(row.cnt, 10);
            if (count >= POOL_TARGET) {
                console.log(`[PoolFill] Category "${row.category}" already has ${count} questions — skipping.`);
                continue;
            }
            console.log(`[PoolFill] Category "${row.category}" has ${count} questions (target ${POOL_TARGET}). Generating...`);
            await aiService.ensureCategoryPool(row.category, POOL_TARGET);
            // small gap between categories to keep the process light
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log('[PoolFill] Done.');
    } catch (error) {
        console.error('[PoolFill] Error during pool fill:', error);
    }
}
