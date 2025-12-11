import { Router } from 'express';
import { featureWishlistController } from '../controllers/FeatureWishlistController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Public read? Guide didn't specify auth for get, but implementation usually implies public or auth. 
// Guide's `getAllWishes` didn't check user. 
// However, the `createWish` uses `(req as any).user`.
// I'll ensure `authenticateToken` is used where user info is needed.
// If I use `authenticateToken` globally for these routes, then only logged-in users can see.
// That makes sense for a "Feature Wishlist" within a logged-in app area.

router.get('/', featureWishlistController.getAllWishes);
router.post('/', authenticateToken, featureWishlistController.createWish);
router.put('/:id/status', authenticateToken, featureWishlistController.updateWishStatus);
router.delete('/:id', authenticateToken, featureWishlistController.deleteWish);

export default router;
