
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { QuestionModel } from '../models/questionModel';

import { AiService } from '../services/aiService';

export class AdminController {
    private questionModel: QuestionModel;
    private db: Pool;
    private aiService: AiService;
    private adminPassword = (() => {
        const pw = process.env.ADMIN_PASSWORD;
        if (!pw) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('ADMIN_PASSWORD must be set in production.');
            }
            console.warn('[AdminController] ADMIN_PASSWORD not set. Using insecure development default!');
            return 'admin';
        }
        return pw;
    })();

    constructor(pool: Pool) {
        this.db = pool;
        this.questionModel = new QuestionModel(pool);
        this.aiService = new AiService(pool);
    }

    /**
     * Get global premium status
     */
    getGlobalPremiumStatus = async (req: Request, res: Response) => {
        const password = req.body.password || req.query.password;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const result = await this.db.query("SELECT key, value FROM system_settings WHERE key IN ('global_premium_unlocked', 'global_guest_premium_unlocked')");
            const settings: Record<string, boolean> = {};
            result.rows.forEach(row => {
                settings[row.key] = row.value === 'true';
            });

            res.json({
                userUnlocked: !!settings['global_premium_unlocked'],
                guestUnlocked: !!settings['global_guest_premium_unlocked']
            });
        } catch (error) {
            console.error('Error fetching global premium status:', error);
            res.status(500).json({ error: 'Failed to fetch global premium status' });
        }
    }

    /**
     * Toggle global premium status
     */
    toggleGlobalPremiumStatus = async (req: Request, res: Response) => {
        const { password, unlocked, type } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        const key = type === 'guest' ? 'global_guest_premium_unlocked' : 'global_premium_unlocked';

        try {
            const newValue = unlocked ? 'true' : 'false';
            await this.db.query(
                "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
                [key, newValue]
            );
            res.json({ success: true, unlocked: newValue === 'true', type: type || 'user' });
        } catch (error) {
            console.error('Error updating global premium status:', error);
            res.status(500).json({ error: 'Failed to update global premium status' });
        }
    }

    /**
     * Verify the admin password
     */
    verifyPassword = (req: Request, res: Response) => {
        const { password } = req.body;
        if (password === this.adminPassword) {
            res.json({ success: true, message: 'Password verified' });
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    }

    /**
     * Get all categories for administration
     */
    /**
     * Get all categories for administration
     */
    getAllCategories = async (req: Request, res: Response) => {
        const password = req.body.password || req.query.password;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const categories = await this.questionModel.getAllCategories();
            res.json(categories);
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    }

    /**
     * Delete questions by categories
     */
    deleteQuestionsByCategories = async (req: Request, res: Response) => {
        const { categories, password } = req.body;

        // Double check password for destructive action
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        if (!categories || !Array.isArray(categories) || categories.length === 0) {
            res.status(400).json({ error: 'Invalid categories provided' });
            return;
        }

        try {
            const count = await this.questionModel.deleteQuestionsByCategories(categories);
            res.json({ success: true, count, message: `Successfully deleted ${count} questions` });
        } catch (error) {
            console.error('Error deleting questions:', error);
            res.status(500).json({ error: 'Failed to delete questions' });
        }
    }

    /**
     * Trigger AI generation for a single category (fills the pool towards the target)
     */
    fillCategoryPool = async (req: Request, res: Response) => {
        const { category, password } = req.body;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }
        if (!category || typeof category !== 'string') {
            res.status(400).json({ error: 'Invalid category provided' });
            return;
        }

        // Fire-and-forget so the dashboard stays responsive; generation happens
        // in the background (ensureCategoryPool respects the 6h cooldown)
        this.aiService.ensureCategoryPool(category, 150).catch(err => {
            console.error(`[Admin] Background pool fill failed for "${category}":`, err);
        });
        res.json({ success: true, message: `Pool generation started for "${category}"` });
    }

    /**
     * List all questions with pagination and filtering
     */
    listQuestions = async (req: Request, res: Response) => {
        const password = req.body.password || req.query.password;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const category = req.query.category as string;
            const difficulty = req.query.difficulty as string;
            const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

            const offset = (page - 1) * limit;

            const result = await this.questionModel.getAllQuestions(limit, offset, { category, difficulty, is_active: isActive });

            res.json({
                questions: result.questions,
                total: result.total,
                page,
                totalPages: Math.ceil(result.total / limit)
            });
        } catch (error) {
            console.error('Error listing questions:', error);
            res.status(500).json({ error: 'Failed to list questions' });
        }
    }

    /**
     * Delete a single question
     */
    deleteQuestion = async (req: Request, res: Response) => {
        const { password } = req.body;
        const id = parseInt(req.params.id);

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid question ID' });
            return;
        }

        try {
            const success = await this.questionModel.deleteQuestion(id);
            if (success) {
                res.json({ success: true, message: 'Question deleted' });
            } else {
                res.status(404).json({ error: 'Question not found' });
            }
        } catch (error) {
            console.error('Error deleting question:', error);
            res.status(500).json({ error: 'Failed to delete question' });
        }
    }

    /**
     * Grant Premium Status (Admin)
     */
    grantPremium = async (req: Request, res: Response) => {
        try {
            const { userId, email, password } = req.body;

            if (password !== this.adminPassword) {
                res.status(401).json({ error: 'Unauthorized: Invalid password' });
                return;
            }

            if (!userId && !email) {
                res.status(400).json({ error: 'UserId or Email required' });
                return;
            }

            // Using direct pool query since questionModel doesn't handle users
            // Check if user exists and their current status
            const checkQuery = userId
                ? `SELECT id, subscription_status FROM users WHERE id = $1`
                : `SELECT id, subscription_status FROM users WHERE email = $1`;
            const checkValues = userId ? [userId] : [email];
            const checkResult = await this.db.query(checkQuery, checkValues);

            if (checkResult.rows.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            if (checkResult.rows[0].subscription_status === 'premium') {
                res.status(409).json({ error: 'User already has premium status' });
                return;
            }

            const query = userId
                ? `UPDATE users SET subscription_status = 'premium' WHERE id = $1 RETURNING username, email, subscription_status`
                : `UPDATE users SET subscription_status = 'premium' WHERE email = $1 RETURNING username, email, subscription_status`;

            const values = userId ? [userId] : [email];

            const result = await this.db.query(query, values);

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.status(200).json({ message: 'Premium granted', user: result.rows[0] });

        } catch (error: any) {
            console.error('Error granting premium:', error);
            res.status(500).json({ error: 'Internal server error: ' + error.message });
        }
    }
    /**
     * Get all users
     */
    getAllUsers = async (req: Request, res: Response) => {
        const password = req.body.password || req.query.password;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const result = await this.db.query(
                `SELECT id, username, email, subscription_status, subscription_end_date, created_at 
                 FROM users 
                 ORDER BY created_at DESC`
            );
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    }

    /**
     * Update user subscription status
     */
    updateUserStatus = async (req: Request, res: Response) => {
        const { userId, status, password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        if (!['free', 'premium'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        try {
            // If setting to free, we should probably clear the subscription_end_date
            // If setting to premium, we might want to set it to null (permanent) or a date
            // For now, we'll just toggle the status and clear date if free.

            let query = "";
            if (status === 'free') {
                query = `UPDATE users SET subscription_status = $1, subscription_end_date = NULL WHERE id = $2 RETURNING id, username, email, subscription_status`;
            } else {
                query = `UPDATE users SET subscription_status = $1 WHERE id = $2 RETURNING id, username, email, subscription_status`;
            }

            const result = await this.db.query(query, [status, userId]);

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({ success: true, user: result.rows[0] });
        } catch (error) {
            console.error('Error updating user status:', error);
            res.status(500).json({ error: 'Failed to update user status' });
        }
    }

    /**
     * Delete a user
     */
    deleteUser = async (req: Request, res: Response) => {
        const { userId, password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const result = await this.db.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({ success: true, message: 'User deleted successfully' });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }

    /**
     * Update status for a specific question
     */
    updateQuestionStatus = async (req: Request, res: Response) => {
        const { id, isActive, password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const success = await this.questionModel.updateQuestionStatus(id, isActive);
            if (success) {
                res.json({ success: true, message: `Question ${isActive ? 'activated' : 'archived'}` });
            } else {
                res.status(404).json({ error: 'Question not found' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to update question status' });
        }
    }

    /**
     * Update difficulty for a specific question
     */
    updateQuestionDifficulty = async (req: Request, res: Response) => {
        const { difficulty, password } = req.body;
        const id = parseInt(req.params.id);

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid question ID' });
            return;
        }

        try {
            const success = await this.questionModel.updateQuestionDifficulty(id, difficulty);
            if (success) {
                res.json({ success: true, message: `Question difficulty updated to ${difficulty}` });
            } else {
                res.status(404).json({ error: 'Question not found' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to update question difficulty' });
        }
    }

    /**
     * Update status for all questions in a category
     */
    updateCategoryStatus = async (req: Request, res: Response) => {
        const { category, isActive, password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const count = await this.questionModel.updateCategoryStatus(category, isActive);
            res.json({ success: true, count, message: `${count} questions in "${category}" ${isActive ? 'activated' : 'archived'}` });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update category status' });
        }
    }

    /**
     * Update status for ALL questions (Global Archive/Activate)
     */
    updateAllQuestionsStatus = async (req: Request, res: Response) => {
        const { isActive, password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            const count = await this.questionModel.updateAllQuestionsStatus(isActive);
            res.json({ success: true, count, message: `${count} questions globablly ${isActive ? 'activated' : 'archived'}` });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update global question status' });
        }
    }

    /**
     * Archive All and Regenerate
     */
    regenerateQuestions = async (req: Request, res: Response) => {
        const { password } = req.body;

        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        try {
            // 1. Archive All
            console.log('[AdminController] Regenerate: Archiving all questions...');
            await this.questionModel.updateAllQuestionsStatus(false);

            // 2. Get All Categories (even inactive ones might still be in DB distinct query if distinct ignores filter? QuestionModel.getAllCategories currently queries all)
            const categories = await this.questionModel.getAllCategories();
            console.log(`[AdminController] Regenerate: Found ${categories.length} categories to regenerate.`);

            // 3. Trigger AI for each category
            // We'll respond to user immediately saying "Process Started"
            categories.forEach(category => {
                // Trigger background pool check. 
                // Since all are archived, count will be 0 active? ensureCategoryPool checks count WHERE category=x.
                // Wait, ensureCategoryPool checks TOTAL count in table, unrelated to is_active?
                // We need to verify AiService.ensureCategoryPool query.
                // It queries `SELECT COUNT(*) FROM questions WHERE category = $1` -> This counts inactive too!
                // FIX NEEDED: AiService should check Active count?

                // Actuallly, for regeneration, we usually want to build a FRESH set.
                // If we archive them, they are 'gone' from gameplay.
                // If getCount counts them, AiService thinks "we have enough".
                // So AiService needs modification OR we delete them? 
                // User said "archive", so we can't delete. 
                // We need to tell AiService to only count ACTIVE questions.

                // I will fix AiService in a separate tool call, but for now invoke it.
                this.aiService.ensureCategoryPool(category, 50).catch(e => console.error(e));
            });

            res.json({ success: true, message: 'Archive complete. Regeneration started in background.' });

        } catch (error) {
            console.error('Error regenerating questions:', error);
            res.status(500).json({ error: 'Failed to regenerate questions' });
        }
    }

    /**
     * Run the similarity cleanup on demand (embedding backfill + deactivate near-duplicates)
     */
    runSimilarityCleanup = async (req: Request, res: Response) => {
        const { password } = req.body;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        // Fire-and-forget: backfill + deactivation runs in the background
        import('../database/cleanupSimilarQuestions').then(async (mod) => {
            await mod.cleanupSimilarQuestions();
        }).catch(err => {
            console.error('[AdminController] Similarity cleanup failed:', err);
        });

        res.json({ success: true, message: 'Similarity cleanup started in background.' });
    }

    /**
     * Run the full pool maintenance on demand — the same as the boot/24h job:
     * similarity cleanup (backfill + deactivate) followed by filling every
     * category below the pool target (6h cooldown per category still applies).
     */
    runPoolMaintenance = async (req: Request, res: Response) => {
        const { password } = req.body;
        if (password !== this.adminPassword) {
            res.status(401).json({ error: 'Unauthorized: Invalid password' });
            return;
        }

        (async () => {
            try {
                const cleanup = await import('../database/cleanupSimilarQuestions');
                await cleanup.cleanupSimilarQuestions();
            } catch (err) {
                console.error('[AdminController] Cleanup step failed:', err);
            }
            try {
                const fill = await import('../database/fillQuestionPools');
                await fill.fillQuestionPools();
            } catch (err) {
                console.error('[AdminController] Fill step failed:', err);
            }
        })();

        res.json({ success: true, message: 'Pool maintenance (cleanup + fill) started in background.' });
    }
}
