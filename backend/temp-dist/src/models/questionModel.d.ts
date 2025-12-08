import { Pool } from 'pg';
export declare class QuestionModel {
    private db;
    constructor(db: Pool);
    /**
     * Find all questions in the database
     * @returns Array of all questions
     */
    find(): Promise<any[]>;
    /**
     * Get a question by its ID
     * @param id Question ID
     * @returns Question object or null if not found
     */
    getQuestionById(id: number): Promise<any>;
    /**
     * Get a random question for a specific game level
     * @param level Game level (1-15)
     * @param excludeIds Optional array of question IDs to exclude
     * @returns A question object with normalized fields or null if no question is found
     */
    getQuestionByLevel(level: number, excludeIds?: number[]): Promise<any>;
    /**
     * Get multiple random questions with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @param limit Maximum number of questions to return
     * @returns Array of question objects or empty array if none found
     */
    getQuestionsByDifficulty(difficulty: string | null, excludeIds?: number[], limit?: number): Promise<any[]>;
    /**
     * Get a single random question with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @returns A question object or null if none found
     */
    getRandomQuestionByDifficulty(difficulty: string | null, excludeIds?: number[]): Promise<any>;
    /**
     * Fetch a set of questions for an entire game session
     * @param excludeIds Array of question IDs to exclude from results
     * @returns Promise resolving to a map of level to question
     */
    fetchQuestionsForGameSession(excludeIds?: number[]): Promise<Map<number, any>>;
    /**
     * Normalize question fields to ensure consistency
     * @param question The raw question object from the database
     * @param level The game level (1-15)
     * @returns A normalized question object
     */
    private normalizeQuestionFields;
    /**
     * Helper to ensure a value is an array
     * @param value The value to convert to an array if it isn't already
     * @returns An array
     */
    private ensureArray;
    /**
     * Preload and cache questions for better performance
     * @param cacheSize Number of questions to preload per difficulty
     * @returns Promise resolving when cache is populated
     */
    preloadQuestionCache(cacheSize?: number): Promise<void>;
}
