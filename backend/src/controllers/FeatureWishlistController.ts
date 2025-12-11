import { Request, Response } from 'express';
import pool from '../database/db';

const ADMIN_EMAIL = 'fabiank5@hotmail.com';

export const featureWishlistController = {
    getAllWishes: async (req: Request, res: Response) => {
        try {
            const result = await pool.query('SELECT * FROM feature_wishes ORDER BY created_at DESC');
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching wishes:', error);
            res.status(500).json({ message: 'Failed to fetch wishes' });
        }
    },

    createWish: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            // Admin Check as per guide/user request for creation? 
            // Guide says: "Only admin can create wishes" in the controller snippet.
            // I will follow that.
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can create wishes' });
            }

            const { title } = req.body;
            if (!title) {
                return res.status(400).json({ message: 'Title is required' });
            }

            const result = await pool.query(
                'INSERT INTO feature_wishes (title, status, created_by_email) VALUES ($1, $2, $3) RETURNING *',
                [title, 'pending', user.email]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating wish:', error);
            res.status(500).json({ message: 'Failed to create wish' });
        }
    },

    updateWishStatus: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can update wishes' });
            }

            const { id } = req.params;
            const { status } = req.body;

            if (!['pending', 'completed'].includes(status)) {
                return res.status(400).json({ message: 'Invalid status' });
            }

            const result = await pool.query(
                'UPDATE feature_wishes SET status = $1 WHERE id = $2 RETURNING *',
                [status, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Wish not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating wish:', error);
            res.status(500).json({ message: 'Failed to update wish' });
        }
    },

    deleteWish: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user || user.email !== ADMIN_EMAIL) {
                return res.status(403).json({ message: 'Only admin can delete wishes' });
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
