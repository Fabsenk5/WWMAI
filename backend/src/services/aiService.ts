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

    public async generateQuestionsForCategory(category: string): Promise<void> {
        if (!this.genAI) {
            console.log(`[AiService] Skipping generation for '${category}': No API Key.`);
            return;
        }

        console.log(`[AiService] 🤖 Starting background generation for category: "${category}"`);

        try {
            const prompt = `
                Generate 15 unique trivia questions for the category "${category}".
                Create questions with varying difficulties based on this mapping:
                - 4 Easy questions (Levels 1-4)
                - 5 Medium questions (Levels 5-9)
                - 4 Hard questions (Levels 10-13)
                - 2 Very Hard questions (Levels 14-15)

                Return the output strictly as a JSON array of objects with this format:
                {
                    "question": "The question text",
                    "correct_answer": "The correct answer",
                    "incorrect_answers": ["Wrong 1", "Wrong 2", "Wrong 3"],
                    "difficulty": "easy" | "medium" | "hard" | "very_hard"
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
                        INSERT INTO questions (category, difficulty, question, correct_answer, incorrect_answers)
                        VALUES ($1, $2, $3, $4, $5)
                    `;
                    await this.db.query(insertQuery, [
                        category,
                        diff,
                        q.question,
                        q.correct_answer,
                        q.incorrect_answers
                    ]);
                    insertedCount++;
                }
            }

            console.log(`[AiService] ✅ Successfully processed category: "${category}". New questions inserted: ${insertedCount}.`);

        } catch (error) {
            console.error(`[AiService] ❌ Error generating questions for category "${category}":`, error);
        }
    }
}
