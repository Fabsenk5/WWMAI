import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';
import pool from '../database/db';

const router = Router();
const authController = new AuthController(pool);

// Brute-force protection for auth endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many login attempts. Please try again later.'
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many registrations from this IP. Please try again later.'
});

router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/global-settings', authController.getGlobalSettings);
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);

export default router;
