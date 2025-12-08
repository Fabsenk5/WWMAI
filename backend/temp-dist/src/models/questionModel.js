"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionModel = void 0;
// Define prize amounts and difficulty levels mapping
const prizeAmounts = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
const difficultyLevels = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard'];
// Field mapping for normalization
const fieldMappings = {
    id: ['id', 'question_id'],
    text: ['question_text', 'text'],
    correctAnswer: ['correct_answer', 'correctAnswer'],
    options: ['answers', 'options']
};
class QuestionModel {
    constructor(db) {
        this.db = db; // Store the passed-in pool instance
    }
    /**
     * Find all questions in the database
     * @returns Array of all questions
     */
    find() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.db.query('SELECT * FROM questions');
                return result.rows;
            }
            catch (error) {
                console.error('Error fetching all questions:', error);
                throw new Error('Failed to fetch questions from database');
            }
        });
    }
    /**
     * Get a question by its ID
     * @param id Question ID
     * @returns Question object or null if not found
     */
    getQuestionById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!id) {
                console.error('Invalid question ID provided:', id);
                return null;
            }
            try {
                const query = 'SELECT * FROM questions WHERE question_id = $1'; // Changed id to question_id
                const { rows } = yield this.db.query(query, [id]);
                if (rows.length === 0) {
                    return null;
                }
                return this.normalizeQuestionFields(rows[0], 0); // Level 0 means unknown level
            }
            catch (error) {
                console.error(`Error fetching question by ID ${id}:`, error);
                return null;
            }
        });
    }
    /**
     * Get a random question for a specific game level
     * @param level Game level (1-15)
     * @param excludeIds Optional array of question IDs to exclude
     * @returns A question object with normalized fields or null if no question is found
     */
    getQuestionByLevel(level_1) {
        return __awaiter(this, arguments, void 0, function* (level, excludeIds = []) {
            // Validate level
            if (level < 1 || level > 15) {
                console.error(`Invalid level specified: ${level}. Must be between 1 and 15.`);
                return null;
            }
            try {
                // Get the appropriate difficulty for this level
                const difficulty = difficultyLevels[level - 1];
                let question = null;
                // First try: Get a question with the exact difficulty for this level
                question = yield this.getRandomQuestionByDifficulty(difficulty, excludeIds);
                // Second try: If no question found with exact difficulty, try any difficulty
                if (!question) {
                    console.warn(`No questions found for difficulty: ${difficulty} (level ${level}). Falling back to any difficulty.`);
                    question = yield this.getRandomQuestionByDifficulty(null, excludeIds);
                }
                // Final check: If still no question found, we have no questions available
                if (!question) {
                    console.error('No available questions found after fallback attempts');
                    return null;
                }
                // Return normalized question with prize amount for this level
                return this.normalizeQuestionFields(question, level);
            }
            catch (error) {
                console.error(`Error fetching question for level ${level}:`, error);
                return null;
            }
        });
    }
    /**
     * Get multiple random questions with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @param limit Maximum number of questions to return
     * @returns Array of question objects or empty array if none found
     */
    getQuestionsByDifficulty(difficulty_1) {
        return __awaiter(this, arguments, void 0, function* (difficulty, excludeIds = [], limit = 5) {
            try {
                let query = 'SELECT * FROM questions';
                const params = [];
                let paramIndex = 1;
                // Build the WHERE clause conditionally
                const conditions = [];
                if (difficulty) {
                    conditions.push(`difficulty = $${paramIndex++}`);
                    params.push(difficulty);
                }
                if (excludeIds.length > 0) {
                    conditions.push(`question_id NOT IN (${excludeIds.map(() => `$${paramIndex++}`).join(',')})`); // Changed id to question_id
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
                const { rows } = yield this.db.query(query, params);
                // Return normalized question objects
                return rows.map(question => this.normalizeQuestionFields(question, 0));
            }
            catch (error) {
                console.error('Error in getQuestionsByDifficulty:', error);
                return [];
            }
        });
    }
    /**
     * Get a single random question with specific difficulty
     * @param difficulty The difficulty to filter by, or null for any difficulty
     * @param excludeIds Array of question IDs to exclude
     * @returns A question object or null if none found
     */
    getRandomQuestionByDifficulty(difficulty_1) {
        return __awaiter(this, arguments, void 0, function* (difficulty, excludeIds = []) {
            const questions = yield this.getQuestionsByDifficulty(difficulty, excludeIds, 1);
            return questions.length > 0 ? questions[0] : null;
        });
    }
    /**
     * Fetch a set of questions for an entire game session
     * @param excludeIds Array of question IDs to exclude from results
     * @returns Promise resolving to a map of level to question
     */
    fetchQuestionsForGameSession() {
        return __awaiter(this, arguments, void 0, function* (excludeIds = []) {
            try {
                const questionsMap = new Map();
                const usedIds = [...excludeIds];
                // Prefetch questions for each level
                for (let level = 1; level <= 15; level++) {
                    const question = yield this.getQuestionByLevel(level, usedIds);
                    if (question) {
                        questionsMap.set(level, question);
                        usedIds.push(question.id);
                    }
                    else {
                        console.error(`Failed to find any question for level ${level}`);
                    }
                }
                return questionsMap;
            }
            catch (error) {
                console.error('Error fetching questions for game session:', error);
                throw new Error('Failed to fetch questions for game session');
            }
        });
    }
    /**
     * Normalize question fields to ensure consistency
     * @param question The raw question object from the database
     * @param level The game level (1-15)
     * @returns A normalized question object
     */
    normalizeQuestionFields(question, level) {
        if (!question)
            return null;
        // Make a copy of the question to avoid modifying the original
        const normalizedQuestion = Object.assign({}, question);
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
    ensureArray(value) {
        if (!value)
            return [];
        if (Array.isArray(value))
            return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            }
            catch (_a) {
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
    preloadQuestionCache() {
        return __awaiter(this, arguments, void 0, function* (cacheSize = 10) {
            try {
                const difficulties = ['easy', 'medium', 'hard'];
                for (const difficulty of difficulties) {
                    const query = 'SELECT * FROM questions WHERE difficulty = $1 ORDER BY RANDOM() LIMIT $2';
                    yield this.db.query(query, [difficulty, cacheSize]);
                    console.log(`Preloaded ${cacheSize} ${difficulty} questions into connection pool cache`);
                }
            }
            catch (error) {
                console.error('Error preloading question cache:', error);
            }
        });
    }
}
exports.QuestionModel = QuestionModel;
