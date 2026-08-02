import pool from './db';
// NOTE: embeddingService (-> @xenova/transformers, ESM-only) is imported dynamically
// inside the functions below so jest/ts-jest can still parse this module and
// app.ts can boot without loading the ONNX model graph.

const BACKFILL_BATCH = 50;
const DEACTIVATE_SIMILARITY = 0.90;
const DEACTIVATE_SAME_ANSWER_SIMILARITY = 0.60;

async function loadEmbeddingApi() {
    const mod = await import('../services/embeddingService');
    return {
        getQuestionEmbedding: mod.getQuestionEmbedding,
        cosineSimilarity: mod.cosineSimilarity,
        normalizeText: mod.normalizeText,
    };
}

async function backfillEmbeddings(): Promise<number> {
    const { getQuestionEmbedding } = await loadEmbeddingApi();
    let backfilled = 0;
    while (true) {
        const res = await pool.query(
            `SELECT id, question, correct_answer
             FROM questions
             WHERE embedding IS NULL
             ORDER BY id
             LIMIT $1`,
            [BACKFILL_BATCH]
        );
        const rows = res.rows;
        if (rows.length === 0) break;

        for (const row of rows) {
            try {
                const embedding = await getQuestionEmbedding(row.question, row.correct_answer);
                await pool.query(`UPDATE questions SET embedding = $1 WHERE id = $2`, [embedding, row.id]);
                backfilled++;
            } catch (err) {
                console.error(`[QuestionCleanup] Backfill failed for question ${row.id}:`, err);
                return backfilled; // stop backfill on model errors (retry next run)
            }
        }
        console.log(`[QuestionCleanup] Backfilled ${backfilled} embeddings so far...`);
    }
    return backfilled;
}

async function deactivateSimilarInCategory(category: string): Promise<number> {
    const { cosineSimilarity, normalizeText } = await loadEmbeddingApi();
    const res = await pool.query(
        `SELECT id, question, correct_answer, embedding, created_at
         FROM questions
         WHERE category = $1 AND is_active = true AND embedding IS NOT NULL
         ORDER BY created_at ASC, id ASC`,
        [category]
    );
    const rows = res.rows;
    if (rows.length < 2) return 0;

    let deactivated = 0;
    for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
            const a = rows[i];
            const b = rows[j];
            const sim = cosineSimilarity(a.embedding, b.embedding);
            const sameAnswer = normalizeText(a.correct_answer) === normalizeText(b.correct_answer);
            if (sim >= DEACTIVATE_SIMILARITY || (sameAnswer && sim >= DEACTIVATE_SAME_ANSWER_SIMILARITY)) {
                // Deactivate the NEWER one (b), keep the older (a)
                await pool.query(`UPDATE questions SET is_active = false WHERE id = $1`, [b.id]);
                console.log(`[QuestionCleanup] Deactivated question ${b.id} ("${b.question}") — too similar to ${a.id} ("${a.question}") [sim=${sim.toFixed(3)}]`);
                deactivated++;
            }
        }
    }
    return deactivated;
}

export async function cleanupSimilarQuestions(): Promise<void> {
    console.log('[QuestionCleanup] Starting similarity cleanup...');
    try {
        const backfilled = await backfillEmbeddings();
        console.log(`[QuestionCleanup] Embedding backfill done: ${backfilled} new embeddings.`);

        const catsRes = await pool.query(
            `SELECT category, COUNT(*) AS cnt FROM questions WHERE is_active = true GROUP BY category HAVING COUNT(*) >= 2 ORDER BY cnt DESC`
        );
        const categories = catsRes.rows.map((r: any) => r.category);
        console.log(`[QuestionCleanup] Scanning ${categories.length} categories with >= 2 active questions.`);

        let totalDeactivated = 0;
        for (const category of categories) {
            const deactivated = await deactivateSimilarInCategory(category);
            totalDeactivated += deactivated;
        }
        console.log(`[QuestionCleanup] Done. Deactivated ${totalDeactivated} similar question(s) total.`);
    } catch (error) {
        console.error('[QuestionCleanup] Error during similarity cleanup:', error);
    }
}
