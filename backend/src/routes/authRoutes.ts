import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middleware/authMiddleware';
import pool from '../database/db';

const router = Router();
const authController = new AuthController(pool);

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/global-settings', authController.getGlobalSettings);
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);

export default router;
