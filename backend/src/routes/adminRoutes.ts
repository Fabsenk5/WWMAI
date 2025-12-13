
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
    router.post('/grant-premium', adminController.grantPremium);
    router.get('/global-premium', adminController.getGlobalPremiumStatus);
    router.post('/global-premium', adminController.toggleGlobalPremiumStatus);

    // Question Archival & Regeneration
    router.post('/questions/status', adminController.updateQuestionStatus);
    router.post('/questions/:id/difficulty', adminController.updateQuestionDifficulty);
    router.post('/categories/status', adminController.updateCategoryStatus);
    router.post('/questions/all-status', adminController.updateAllQuestionsStatus);
    router.post('/questions/regenerate', adminController.regenerateQuestions);

    // User Management
    router.get('/users', adminController.getAllUsers);
    router.post('/users/status', adminController.updateUserStatus);
    router.post('/users/delete', adminController.deleteUser);


    return router;
}
