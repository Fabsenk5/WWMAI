import { Request, Response } from 'express';
import pool from '../database/db';

const ADMIN_EMAIL = 'fabiank5@hotmail.com';

export const featureWishlistController = {
    getAllWishes: async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await pool.query('SELECT * FROM feature_wishes ORDER BY created_at DESC');
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching wishes:', error);
            res.status(500).json({ message: 'Failed to fetch wishes' });
        }
    },

    createWish: async (req: Request, res: Response): Promise<void> => {
        try {
            const user = (req as any).user;
            if (!user || !user.userId) {
                res.status(401).json({ message: 'Unauthorized' });
                return;
            }

            // Fetch user email from DB since it's not in the token
            const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [user.userId]);
            if (userResult.rows.length === 0) {
                res.status(401).json({ message: 'User not found' });
                return;
            }
            const userEmail = userResult.rows[0].email;

            // Removed admin check to allow all users to create wishes
            // if (userEmail !== ADMIN_EMAIL) {
            //     res.status(403).json({ message: 'Only admin can create wishes' });
            //     return;
            // }

            const { title } = req.body;
            if (!title) {
                res.status(400).json({ message: 'Title is required' });
                return;
            }

            const result = await pool.query(
                'INSERT INTO feature_wishes (title, status, created_by_email) VALUES ($1, $2, $3) RETURNING *',
                [title, 'pending', userEmail]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating wish:', error);
            res.status(500).json({ message: 'Failed to create wish' });
        }
    },

    updateWishStatus: async (req: Request, res: Response): Promise<void> => {
        try {
            const user = (req as any).user;
            if (!user || !user.userId) {
                res.status(401).json({ message: 'Unauthorized' });
                return;
            }

            // Fetch user email from DB
            const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [user.userId]);
            if (userResult.rows.length === 0) {
                res.status(401).json({ message: 'User not found' });
                return;
            }
            const userEmail = userResult.rows[0].email;

            if (userEmail !== ADMIN_EMAIL) {
                res.status(403).json({ message: 'Only admin can update wishes' });
                return;
            }

            const { id } = req.params;
            const { status } = req.body;

            if (!['pending', 'completed'].includes(status)) {
                res.status(400).json({ message: 'Invalid status' });
                return;
            }

            const result = await pool.query(
                'UPDATE feature_wishes SET status = $1 WHERE id = $2 RETURNING *',
                [status, id]
            );

            if (result.rows.length === 0) {
                res.status(404).json({ message: 'Wish not found' });
                return;
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating wish:', error);
            res.status(500).json({ message: 'Failed to update wish' });
        }
    },

    deleteWish: async (req: Request, res: Response): Promise<void> => {
        try {
            const user = (req as any).user;
            if (!user || !user.userId) {
                res.status(401).json({ message: 'Unauthorized' });
                return;
            }

            // Fetch user email from DB
            const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [user.userId]);
            if (userResult.rows.length === 0) {
                res.status(401).json({ message: 'User not found' });
                return;
            }
            const userEmail = userResult.rows[0].email;

            if (userEmail !== ADMIN_EMAIL) {
                res.status(403).json({ message: 'Only admin can delete wishes' });
                return;
            }

            const { id } = req.params;
            await pool.query('DELETE FROM feature_wishes WHERE id = $1', [id]);
            res.json({ message: 'Wish deleted' });
        } catch (error) {
            console.error('Error deleting wish:', error);
            res.status(500).json({ message: 'Failed to delete wish' });
        }
    }
};
