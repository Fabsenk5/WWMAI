import { Pool } from 'pg';

// Define prize amounts and difficulty levels mapping
const prizeAmounts = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
const difficultyLevels = ['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'hard', 'very_hard', 'very_hard'];

// Field mapping for normalization
const fieldMappings = {
    id: ['id', 'question_id'],
    text: ['question_text', 'text', 'question'],
    correctAnswer: ['correct_answer', 'correctAnswer'],
    options: ['answers', 'options']
};

export class QuestionModel {
    private db: Pool; // Expect a Pool instance to be passed in

    constructor(db: Pool) {
        this.db = db; // Store the passed-in pool instance
    }

    /**
     * Find all questions in the database
     * @returns Array of all questions
     */
    async find() {
        try {
            const result = await this.db.query('SELECT * FROM questions');
            return result.rows;
        } catch (error) {
            console.error('Error fetching all questions:', error);
            throw new Error('Failed to fetch questions from database');
        }
    }

    /**
     * Get a question by its ID
     * @param id Question ID
     * @returns Question object or null if not found
     */
    async getQuestionById(id: number) {
        if (!id) {
            console.error('Invalid question ID provided:', id);
            return null;
        }

        try {
            const query = 'SELECT * FROM questions WHERE id = $1'; // Changed from question_id to id
            const { rows } = await this.db.query(query, [id]);

            if (rows.length === 0) {
                return null;
            }

            return this.normalizeQuestionFields(rows[0], 0); // Level 0 means unknown level
        } catch (error) {
            console.error(`Error fetching question by ID ${id}:`, error);
            return null;
        }
    }

    /**
     * Get a random question for a specific game level
     * @param level Game level (1-15)
     * @param excludeIds Optional array of question IDs to exclude
     * @returns A question object with normalized fields or null if no question is found
     */
    async getQuestionByLevel(level: number, excludeIds: number[] = [], categories: string[] | null = null, difficultyMode: string = 'standard') {
        // Validate level
        if (level < 1 || level > 15) {
            console.error(`Invalid level specified: ${level}. Must be between 1 and 15.`);
            return null;
        }

        try {
            // Determine difficulty based on mode
            let difficulty = difficultyLevels[level - 1]; // Default 'standard'

            if (difficultyMode === 'easy') {
                // Easy: 1-10 are 'easy', 11-15 are 'medium'
                if (level <= 10) difficulty = 'easy';
                else difficulty = 'medium';
            } else if (difficultyMode === 'hard') {
                // Hard: 1-5 are 'medium', 6-15 are 'hard'
                if (level <= 5) difficulty = 'medium';
                else difficulty = 'hard'; // 'very_hard' not consistently used in DB yet? Use 'hard' or existing map.
            } else if (difficultyMode === 'mixed') {
                // Mixed: Random difficulty
                const levels = ['easy', 'medium', 'hard'];
                difficulty = levels[Math.floor(Math.random() * levels.length)];
            }

            let question = null;

            // 1. Try: Exact difficulty AND Selected Categories
            if (categories && categories.length > 0) {
                question = await this.getRandomQuestionByDifficulty(difficulty, excludeIds, categories);
            }

            // 2. Fallback: Adjacent Difficulties (Smart Fallback)
            if (!question) {
                console.log(`[QuestionModel] No question found for level ${level} (${difficulty}). Trying fallbacks.`);

                let fallbackOrder: string[] = [];

                if (difficulty === 'very_hard') {
                    fallbackOrder = ['hard', 'medium', 'easy'];
                } else if (difficulty === 'hard') {
                    fallbackOrder = ['medium', 'very_hard', 'easy'];
                } else if (difficulty === 'medium') {
                    if (level < 8) {
                        // Early game medium: Prefer easier fallback
                        fallbackOrder = ['easy', 'hard', 'very_hard'];
                    } else {
                        // Late game medium: Prefer harder fallback
                        fallbackOrder = ['hard', 'easy', 'very_hard'];
                    }
                } else {
                    // easy
                    fallbackOrder = ['medium', 'hard', 'very_hard'];
                }

                for (const fbDiff of fallbackOrder) {
                    if (categories && categories.length > 0) {
                        question = await this.getRandomQuestionByDifficulty(fbDiff, excludeIds, categories);
                    }
                    if (!question) {
                        question = await this.getRandomQuestionByDifficulty(fbDiff, excludeIds, null);
                    }
                    if (question) {
                        console.log(`[QuestionModel] Fallback successful: Found '${fbDiff}' question for level ${level} (Target: ${difficulty})`);
                        break;
                    }
                }
            }

            // 3. Last Resort: Any random question (ignoring difficulty completely if above failed)
            if (!question) {
                console.warn(`No questions found for difficulty hierarchy starting at: ${difficulty} (level ${level}). Falling back to purely random.`);
                question = await this.getRandomQuestionByDifficulty(null, excludeIds, null);
            }

            // Final check: If still no question found, we have no questions available
            if (!question) {
                console.error('No available questions found after fallback attempts');
                return null;
            }

            // Return normalized question with prize amount for this level
            return this.normalizeQuestionFields(question, level);
        } catch (error) {
            console.error(`Error fetching question for level ${level}:`, error);
            return null;
        }
    }

    /**
     * Get multiple random questions with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @param limit Maximum number of questions to return
     * @returns Array of question objects or empty array if none found
     */
    async getQuestionsByDifficulty(difficulty: string | null, excludeIds: number[] = [], limit: number = 5, categories: string[] | null = null) {
        try {
            let query = 'SELECT * FROM questions';
            const params: any[] = [];
            let paramIndex = 1;

            // Build the WHERE clause conditionally
            const conditions: string[] = [];

            // Conditions
            // Enforce active status for gameplay queries
            conditions.push('is_active = true');

            if (difficulty) {
                conditions.push(`difficulty = $${paramIndex++}`);
                params.push(difficulty);
            }

            if (categories && categories.length > 0) {
                conditions.push(`category = ANY($${paramIndex++})`);
                params.push(categories);
            }

            if (excludeIds.length > 0) {
                conditions.push(`id NOT IN (${excludeIds.map(() => `$${paramIndex++}`).join(',')})`);
                params.push(...excludeIds);
            }

            // Add WHERE clause if we have conditions
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            // Complete the query with random ordering and limit
            query += ' ORDER BY RANDOM() LIMIT $' + paramIndex;
            params.push(limit);

            // Execute the query
            const { rows } = await this.db.query(query, params);

            // Return normalized question objects
            return rows.map(question => this.normalizeQuestionFields(question, 0));
        } catch (error) {
            console.error('Error in getQuestionsByDifficulty:', error);
            return [];
        }
    }

    /**
     * Get a single random question with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @returns A question object or null if none found
     */
    async getRandomQuestionByDifficulty(difficulty: string | null, excludeIds: number[] = [], categories: string[] | null = null) {
        const questions = await this.getQuestionsByDifficulty(difficulty, excludeIds, 1, categories);
        return questions.length > 0 ? questions[0] : null;
    }

    /**
     * Fetch a set of questions for an entire game session
     * @param excludeIds Array of question IDs to exclude from results
     * @returns Promise resolving to a map of level to question
     */
    async fetchQuestionsForGameSession(excludeIds: number[] = []): Promise<Map<number, any>> {
        try {
            const questionsMap = new Map<number, any>();
            const usedIds: number[] = [...excludeIds];

            // Prefetch questions for each level
            for (let level = 1; level <= 15; level++) {
                const question = await this.getQuestionByLevel(level, usedIds);

                if (question) {
                    questionsMap.set(level, question);
                    usedIds.push(question.id);
                } else {
                    console.error(`Failed to find any question for level ${level}`);
                }
            }

            return questionsMap;
        } catch (error) {
            console.error('Error fetching questions for game session:', error);
            throw new Error('Failed to fetch questions for game session');
        }
    }

    /**
     * Normalize question fields to ensure consistency
     * @param question The raw question object from the database
     * @param level The game level (1-15)
     * @returns A normalized question object
     */
    private normalizeQuestionFields(question: any, level: number) {
        if (!question) return null;

        // Make a copy of the question to avoid modifying the original
        const normalizedQuestion = { ...question };

        // Apply field mappings for consistency
        for (const [standardField, aliases] of Object.entries(fieldMappings)) {
            // Find the first defined value among aliases
            const definedValue = aliases.find(alias => normalizedQuestion[alias] !== undefined);

            // If we found a defined value, ensure all aliases have this value
            if (definedValue) {
                const value = normalizedQuestion[definedValue];
                aliases.forEach(alias => {
                    normalizedQuestion[alias] = value;
                });
            }
        }

        // Ensure arrays are properly parsed
        ['options', 'answers', 'incorrect_answers'].forEach(arrayField => {
            if (normalizedQuestion[arrayField] !== undefined) {
                normalizedQuestion[arrayField] = this.ensureArray(normalizedQuestion[arrayField]);
            }
        });

        // Add level and prize amount to the question
        if (level > 0 && level <= 15) {
            normalizedQuestion.level = level;
            normalizedQuestion.prize = prizeAmounts[level - 1];
        }

        return normalizedQuestion;
    }

    /**
     * Helper to ensure a value is an array
     * @param value The value to convert to an array if it isn't already
     * @returns An array
     */
    private ensureArray(value: any): any[] {
        if (!value) return [];
        if (Array.isArray(value)) return value;

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                // If parsing fails, it might be a comma-separated string
                return value.includes(',') ? value.split(',').map(item => item.trim()) : [value];
            }
        }

        return [value]; // Convert non-array, non-string to single-item array
    }

    /**
     * Preload and cache questions for better performance
     * @param cacheSize Number of questions to preload per difficulty
     * @returns Promise resolving when cache is populated
     */
    async preloadQuestionCache(cacheSize: number = 10): Promise<void> {
        try {
            const difficulties = ['easy', 'medium', 'hard'];
            for (const difficulty of difficulties) {
                const query = 'SELECT * FROM questions WHERE difficulty = $1 ORDER BY RANDOM() LIMIT $2';
                await this.db.query(query, [difficulty, cacheSize]);
                console.log(`Preloaded ${cacheSize} ${difficulty} questions into connection pool cache`);
            }
        } catch (error) {
            console.error('Error preloading question cache:', error);
        }
    }

    /**
     * Get all unique categories from the database
     * @returns Array of category strings
     */
    async getAllCategories(): Promise<string[]> {
        try {
            const result = await this.db.query('SELECT DISTINCT category FROM questions ORDER BY category ASC');
            return result.rows.map(row => row.category).filter(cat => cat); // Filter out nulls/empty
        } catch (error) {
            console.error('Error fetching categories:', error);
            throw new Error('Failed to fetch categories');
        }
    }

    /**
     * Delete questions belonging to specific categories
     * @param categories Array of category names to delete
     * @returns Number of deleted questions
     */
    async deleteQuestionsByCategories(categories: string[]): Promise<number> {
        if (!categories || categories.length === 0) return 0;

        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // 1. Delete dependent player_answers first (DISABLED: Persist Stats)
            // const cleanupQuery = ` Delete query was here `;
            // await client.query(cleanupQuery, [categories]);

            // 2. Dereference from games table (set current_question_id to NULL)
            const dereferenceQuery = `
                UPDATE games 
                SET current_question_id = NULL
                WHERE current_question_id IN (
                    SELECT id FROM questions WHERE category = ANY($1)
                )
            `;
            await client.query(dereferenceQuery, [categories]);

            // 3. Delete the questions
            const query = 'DELETE FROM questions WHERE category = ANY($1)';
            const result = await client.query(query, [categories]);

            await client.query('COMMIT');
            return result.rowCount || 0;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting questions by categories:', error);
            throw new Error('Failed to delete questions');
        } finally {
            client.release();
        }
    }

    /**
     * Get all questions with optional filtering and pagination
     * @param limit Max number of records
     * @param offset Offset for pagination
     * @param filters Optional filters object
     * @returns Object containing questions array and total count
     */
    async getAllQuestions(limit: number = 50, offset: number = 0, filters: { category?: string, difficulty?: string, is_active?: boolean } = {}) {
        try {
            let query = 'SELECT * FROM questions';
            let countQuery = 'SELECT COUNT(*) FROM questions';
            const params: any[] = [];
            const conditions: string[] = [];
            let paramIndex = 1;

            if (filters.category) {
                conditions.push(`category = $${paramIndex++}`);
                params.push(filters.category);
            }

            if (filters.difficulty) {
                conditions.push(`difficulty = $${paramIndex++}`);
                params.push(filters.difficulty);
            }

            if (filters.is_active !== undefined) {
                conditions.push(`is_active = $${paramIndex++}`);
                params.push(filters.is_active);
            }

            if (conditions.length > 0) {
                const whereClause = ` WHERE ${conditions.join(' AND ')}`;
                query += whereClause;
                countQuery += whereClause;
            }

            // Get total count first
            const countResult = await this.db.query(countQuery, params); // Use same params as filter
            const total = parseInt(countResult.rows[0].count, 10);

            // Add sorting and pagination
            query += ` ORDER BY id ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(limit, offset);

            const result = await this.db.query(query, params);

            return {
                questions: result.rows.map(q => this.normalizeQuestionFields(q, 0)),
                total
            };
        } catch (error) {
            console.error('Error fetching all questions:', error);
            throw new Error('Failed to fetch questions');
        }
    }

    /**
     * Delete a single question by ID
     * @param id Question ID
     * @returns Boolean indicating success
     */
    async deleteQuestion(id: number): Promise<boolean> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // 1. Delete dependent player_answers (DISABLED: Persist Stats)
            // await client.query('DELETE FROM player_answers WHERE question_id = $1', [id]);

            // 2. Dereference from games table
            await client.query('UPDATE games SET current_question_id = NULL WHERE current_question_id = $1', [id]);

            // 3. Delete the question
            const result = await client.query('DELETE FROM questions WHERE id = $1', [id]);

            await client.query('COMMIT');
            return (result.rowCount || 0) > 0;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Error deleting question ${id}:`, error);
            throw new Error('Failed to delete question');
        } finally {
            client.release();
        }
    }

    /**
     * Update status for a specific question
     */
    async updateQuestionStatus(id: number, isActive: boolean): Promise<boolean> {
        try {
            const query = 'UPDATE questions SET is_active = $1 WHERE id = $2';
            const result = await this.db.query(query, [isActive, id]);
            return (result.rowCount || 0) > 0;
        } catch (error) {
            console.error(`Error updating status for question ${id}:`, error);
            throw new Error('Failed to update question status');
        }
    }

    /**
     * Update status for all questions in a category
     */
    async updateCategoryStatus(category: string, isActive: boolean): Promise<number> {
        try {
            const query = 'UPDATE questions SET is_active = $1 WHERE category = $2';
            const result = await this.db.query(query, [isActive, category]);
            return result.rowCount || 0;
        } catch (error) {
            console.error(`Error updating status for category ${category}:`, error);
            throw new Error('Failed to update category status');
        }
    }

    /**
     * Update status for ALL questions
     */
    async updateAllQuestionsStatus(isActive: boolean): Promise<number> {
        try {
            const query = 'UPDATE questions SET is_active = $1';
            const result = await this.db.query(query, [isActive]);
            return result.rowCount || 0;
        } catch (error) {
            console.error('Error updating all questions status:', error);
            throw new Error('Failed to update global question status');
        }
    }

    /**
     * Update difficulty for a specific question
     */
    async updateQuestionDifficulty(id: number, difficulty: string): Promise<boolean> {
        try {
            // Validate difficulty
            const validDifficulties = ['easy', 'medium', 'hard', 'very_hard'];
            if (!validDifficulties.includes(difficulty)) {
                throw new Error('Invalid difficulty level');
            }

            const query = 'UPDATE questions SET difficulty = $1 WHERE id = $2';
            const result = await this.db.query(query, [difficulty, id]);
            return (result.rowCount || 0) > 0;
        } catch (error) {
            console.error(`Error updating difficulty for question ${id}:`, error);
            throw new Error('Failed to update question difficulty');
        }
    }
}