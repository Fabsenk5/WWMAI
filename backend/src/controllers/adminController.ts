
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { QuestionModel } from '../models/questionModel';

export class AdminController {
    private questionModel: QuestionModel;
    private adminPassword = process.env.ADMIN_PASSWORD || 'admin'; // Default fallback, should use env

    constructor(pool: Pool) {
        this.questionModel = new QuestionModel(pool);
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

            const offset = (page - 1) * limit;

            const result = await this.questionModel.getAllQuestions(limit, offset, { category, difficulty });

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
}
