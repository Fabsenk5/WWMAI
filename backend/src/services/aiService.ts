import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Force load env from backend directory if not loaded
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

// Define interface for the Question structure used in DB
interface GeneratedQuestion {
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
    difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
    translations: {
        de: { question: string; correct_answer: string; incorrect_answers: string[] };
        ru: { question: string; correct_answer: string; incorrect_answers: string[] };
        es: { question: string; correct_answer: string; incorrect_answers: string[] };
    };
}

export class AiService {
    private genAI: GoogleGenerativeAI | null = null;
    private db: Pool;

    constructor(dbPool: Pool) {
        this.db = dbPool;
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            console.log(`[AiService] Initialized with API Key: ${apiKey.substring(0, 4)}...`);
        } else {
            console.warn("[AiService] GEMINI_API_KEY not found. AI generation will be disabled.");
        }
    }

    public async ensureCategoryPool(category: string, threshold: number = 50): Promise<void> {
        if (!this.genAI) {
            console.log(`[AiService] Skipping generation for '${category}': No API Key.`);
            return;
        }

        try {
            // 1. Check current count
            const countQuery = `SELECT COUNT(*) FROM questions WHERE category = $1`;
            const countRes = await this.db.query(countQuery, [category]);
            const currentCount = parseInt(countRes.rows[0].count, 10);

            console.log(`[AiService] Category "${category}" has ${currentCount} questions. Threshold: ${threshold}.`);

            const gap = threshold - currentCount;

            if (gap <= 0) {
                console.log(`[AiService] Pool sufficient for "${category}". Skipping generation.`);
                return;
            }

            // 2. Determine amount to generate (Cap at 20 to strictly limit load per request)
            const amountToGenerate = Math.min(gap, 20);
            console.log(`[AiService] 🤖 Starting background generation for "${category}". Target: ${amountToGenerate} new questions.`);

            // 3. Calculate difficulty distribution dynamically
            const easyCount = Math.ceil(amountToGenerate * 0.25);
            const mediumCount = Math.ceil(amountToGenerate * 0.35);
            const hardCount = Math.ceil(amountToGenerate * 0.25);
            const veryHardCount = Math.max(0, amountToGenerate - (easyCount + mediumCount + hardCount));

            const prompt = `
                Generate ${amountToGenerate} unique trivia questions for the category "${category}".
                
                CRITICAL CULTURAL INSTRUCTION:
                Prioritize questions with **International** relevance first, then **European** relevance, then **German** relevance.
                Avoid questions that are too obscure or US-centric.

                Create questions with varying difficulties based on this mapping:
                - ${easyCount} Easy questions (Levels 1-4)
                - ${mediumCount} Medium questions (Levels 5-9)
                - ${hardCount} Hard questions (Levels 10-13)
                - ${veryHardCount} Very Hard questions (Levels 14-15)

                Return the output strictly as a JSON array of objects with this format:
                {
                    "question": "The question text (English)",
                    "correct_answer": "The correct answer (English)",
                    "incorrect_answers": ["Wrong 1", "Wrong 2", "Wrong 3"] (English),
                    "difficulty": "easy" | "medium" | "hard" | "very_hard",
                    "translations": {
                        "de": { "question": "German Q", "correct_answer": "German A", "incorrect_answers": ["German W1", "German W2", "German W3"] },
                        "ru": { "question": "Russian Q", "correct_answer": "Russian A", "incorrect_answers": ["Russian W1", "Russian W2", "Russian W3"] },
                        "es": { "question": "Spanish Q", "correct_answer": "Spanish A", "incorrect_answers": ["Spanish W1", "Spanish W2", "Spanish W3"] }
                    }
                }
                Ensure the JSON is valid and contains no markdown formatting.
            `;

            let result;
            try {
                // Try Primary Model
                const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
                result = await model.generateContent(prompt);
            } catch (err: any) {
                // Check if error is 503 (Service Unavailable / Overloaded)
                if (err.message && (err.message.includes('503') || err.message.includes('Service Unavailable') || err.message.includes('overloaded'))) {
                    console.warn(`[AiService] ⚠️ Primary model overloaded (503). Switching to fallback: "gemini-2.5-flash-lite-preview-09-2025"`);

                    // Try Fallback Model
                    const fallbackModel = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-09-2025" });
                    result = await fallbackModel.generateContent(prompt);
                } else {
                    // Re-throw if it's not a 503 or if fallback fails (caught by outer try-catch)
                    throw err;
                }
            }
            const response = result.response;
            let text = response.text();

            console.log(`[AiService] Raw response from Gemini (first 200 chars): ${text.substring(0, 200)}...`);

            // Cleanup potential markdown code blocks
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            let questions: GeneratedQuestion[];
            try {
                questions = JSON.parse(text);
            } catch (jsonError) {
                console.error(`[AiService] Failed to parse JSON. Raw text:`, text);
                throw jsonError;
            }

            console.log(`[AiService] Parsed ${questions.length} questions. Inserting into DB...`);

            let insertedCount = 0;
            // Insert into DB
            for (const q of questions) {
                // Determine normalized difficulty string just in case
                let diff = q.difficulty.toLowerCase();
                if (!['easy', 'medium', 'hard', 'very_hard'].includes(diff)) {
                    diff = 'medium'; // fallback
                }

                // Check for duplicates to avoid constraint errors
                const checkQuery = `SELECT id FROM questions WHERE category = $1 AND question = $2 AND difficulty = $3`;
                const checkRes = await this.db.query(checkQuery, [category, q.question, diff]);

                if (checkRes.rows.length === 0) {
                    const insertQuery = `
                        INSERT INTO questions (category, difficulty, question, correct_answer, incorrect_answers, translations)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `;
                    await this.db.query(insertQuery, [
                        category,
                        diff,
                        q.question,
                        q.correct_answer,
                        q.incorrect_answers,
                        JSON.stringify(q.translations)
                    ]);
                    insertedCount++;
                }
            }

            console.log(`[AiService] ✅ Successfully processed category: "${category}". New questions inserted: ${insertedCount}.`);

        } catch (error) {
            console.error(`[AiService] ❌ Error ensuring pool for category "${category}":`, error);
        }
    }

    public async backfillTranslations(limit: number = 50): Promise<void> {
        if (!this.genAI) {
            console.warn('[AiService] No API Key. Cannot backfill translations.');
            return;
        }

        try {
            // Find questions with missing translations
            // Assuming "missing" means NULL or empty object '{}' or undefined
            const query = `
                SELECT id, question, correct_answer, incorrect_answers 
                FROM questions 
                WHERE translations IS NULL OR translations::text = '{}' 
                LIMIT $1
            `;
            const res = await this.db.query(query, [limit]);
            const questionsToBackfill = res.rows;

            if (questionsToBackfill.length === 0) {
                console.log('[AiService] No questions found needing translation backfill.');
                return;
            }

            console.log(`[AiService] Found ${questionsToBackfill.length} questions to backfill.`);

            // Process in batches of 5 to avoid huge prompts but keep reasonable speed
            const batchSize = 5;
            for (let i = 0; i < questionsToBackfill.length; i += batchSize) {
                const batch = questionsToBackfill.slice(i, i + batchSize);

                const prompt = `
                    Translate the following trivia questions into German (de), Russian (ru), and Spanish (es).
                    Input Questions:
                    ${JSON.stringify(batch)}

                    Return a JSON array of objects, where each object corresponds to an input question and contains ONLY the translations map.
                    The order must match the input array.
                    
                    Format:
                    [
                        {
                            "id": <original_id>,
                            "translations": {
                                "de": { "question": "...", "correct_answer": "...", "incorrect_answers": [...] },
                                "ru": { ... },
                                "es": { ... }
                            }
                        }
                    ]
                `;

                try {
                    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
                    const result = await model.generateContent(prompt);
                    const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                    const translatedBatch = JSON.parse(responseText);

                    for (const item of translatedBatch) {
                        if (item.id && item.translations) {
                            await this.db.query(
                                `UPDATE questions SET translations = $1 WHERE id = $2`,
                                [JSON.stringify(item.translations), item.id]
                            );
                            console.log(`[AiService] Updated translations for question ID: ${item.id}`);
                        }
                    }
                } catch (err) {
                    console.error(`[AiService] Error processing batch starting at index ${i}:`, err);
                }
            }
            console.log('[AiService] Backfill complete.');

        } catch (error) {
            console.error('[AiService] Error in backfillTranslations:', error);
        }
    }
}
