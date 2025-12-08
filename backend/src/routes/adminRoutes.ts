
import { Router } from 'express';
import { Pool } from 'pg';
import { AdminController } from '../controllers/adminController';

export function createAdminRouter(pool: Pool): Router {
    const router = Router();
    const adminController = new AdminController(pool);

    router.post('/verify-password', adminController.verifyPassword);
    router.get('/categories', adminController.getAllCategories);
    router.post('/categories/delete', adminController.deleteQuestionsByCategories);
    router.get('/questions', adminController.listQuestions);
    router.post('/questions/:id/delete', adminController.deleteQuestion);

    return router;
}
