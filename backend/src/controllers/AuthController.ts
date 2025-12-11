import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export class AuthController {
    private db: Pool;
    private readonly SALT_ROUNDS = 10;
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_prod';

    constructor(dbPool: Pool) {
        this.db = dbPool;
    }

    // Register a new user
    public register = async (req: Request, res: Response): Promise<void> => {
        try {
            const { username, email, password } = req.body;

            if (!username || !email || !password) {
                res.status(400).json({ error: 'Username, email, and password are required' });
                return;
            }

            // Check if user exists
            const checkQuery = `SELECT * FROM users WHERE email = $1 OR username = $2`;
            const checkResult = await this.db.query(checkQuery, [email, username]);

            if (checkResult.rows.length > 0) {
                res.status(409).json({ error: 'User with this email or username already exists' });
                return;
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

            // Insert user
            const insertQuery = `
                INSERT INTO users (username, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, username, email, subscription_status, created_at, games_played, games_won, total_earnings, current_win_streak, longest_win_streak
            `;
            const result = await this.db.query(insertQuery, [username, email, passwordHash]);
            const user = result.rows[0];

            // Generate Token
            const token = jwt.sign(
                { userId: user.id, username: user.username, role: user.subscription_status },
                this.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(201).json({ message: 'User registered successfully', token, user });

        } catch (error) {
            console.error('Error in register:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    // Login user
    public login = async (req: Request, res: Response): Promise<void> => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                res.status(400).json({ error: 'Email and password are required' });
                return;
            }

            // Fetch user
            const query = `SELECT * FROM users WHERE email = $1`;
            const result = await this.db.query(query, [email]);

            if (result.rows.length === 0) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            const user = result.rows[0];

            // Verify password
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            // Generate Token
            const token = jwt.sign(
                { userId: user.id, username: user.username, role: user.subscription_status },
                this.JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Remove password hash from response
            delete user.password_hash;

            res.status(200).json({ message: 'Login successful', token, user });

        } catch (error) {
            console.error('Error in login:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    // Get current user profile
    public getMe = async (req: Request, res: Response): Promise<void> => {
        try {
            // userId is attached by authMiddleware
            const userId = (req as any).user?.userId;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const query = `SELECT id, username, email, subscription_status, created_at, avatar_url, subscription_end_date, games_played, games_won, total_earnings, current_win_streak, longest_win_streak FROM users WHERE id = $1`;
            const result = await this.db.query(query, [userId]);

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const user = result.rows[0];

            // Removed global premium check to preserve subscription integrity.
            // Frontend will verify global status.

            // Fetch Category Stats
            const catQuery = `
                SELECT q.category, 
                       COUNT(*) FILTER (WHERE pa.is_correct) as correct_count,
                       COUNT(*) FILTER (WHERE NOT pa.is_correct) as incorrect_count
                FROM player_answers pa
                JOIN questions q ON pa.question_id = q.id
                WHERE pa.user_id = $1
                GROUP BY q.category
            `;
            const catResult = await this.db.query(catQuery, [userId]);

            let bestCat = null;
            let worstCat = null;

            if (catResult.rows.length > 0) {
                // Best: Most correct answers
                const sortedByCorrect = [...catResult.rows].sort((a, b) => parseInt(b.correct_count) - parseInt(a.correct_count));
                if (parseInt(sortedByCorrect[0].correct_count) > 0) {
                    bestCat = { category: sortedByCorrect[0].category, count: parseInt(sortedByCorrect[0].correct_count) };
                }

                // Worst: Most incorrect answers (or should it be least correct?)
                // User asked for "worst category", usually implying where they struggle most.
                // Converting to "Most Incorrect" seems appropriate.
                const sortedByIncorrect = [...catResult.rows].sort((a, b) => parseInt(b.incorrect_count) - parseInt(a.incorrect_count));
                if (parseInt(sortedByIncorrect[0].incorrect_count) > 0) {
                    worstCat = { category: sortedByIncorrect[0].category, count: parseInt(sortedByIncorrect[0].incorrect_count) };
                }
            }

            res.status(200).json({
                user: {
                    ...user,
                    best_category: bestCat,
                    worst_category: worstCat
                }
            });
        } catch (error) {
            console.error('Error in getMe:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    // Get global settings (public)
    public getGlobalSettings = async (req: Request, res: Response): Promise<void> => {
        try {
            const query = `SELECT key, value FROM system_settings WHERE key IN ('global_premium_unlocked', 'global_guest_premium_unlocked')`;
            const result = await this.db.query(query);

            const settings: Record<string, boolean> = {};
            result.rows.forEach(row => {
                settings[row.key] = row.value === 'true';
            });

            res.status(200).json({
                globalPremiumUnlocked: !!settings['global_premium_unlocked'],
                globalGuestPremiumUnlocked: !!settings['global_guest_premium_unlocked']
            });
        } catch (error) {
            console.error('Error fetching global settings:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };


    // Update user profile
    public updateProfile = async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = (req as any).user?.userId;
            const { username, avatar_url } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Optional: Check if username is taken (if changed)
            if (username) {
                const checkQuery = `SELECT id FROM users WHERE username = $1 AND id != $2`;
                const checkResult = await this.db.query(checkQuery, [username, userId]);
                if (checkResult.rows.length > 0) {
                    res.status(409).json({ error: 'Username already taken' });
                    return;
                }
            }

            const updateQuery = `
                UPDATE users 
                SET username = COALESCE($1, username), 
                    avatar_url = COALESCE($2, avatar_url)
                WHERE id = $3
                RETURNING id, username, email, subscription_status, avatar_url
            `;
            const result = await this.db.query(updateQuery, [username, avatar_url, userId]);

            res.status(200).json({ message: 'Profile updated', user: result.rows[0] });

        } catch (error) {
            console.error('Error updating profile:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

}
