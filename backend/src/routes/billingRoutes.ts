import { Router } from 'express';
import { BillingController } from '../controllers/BillingController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();
const billingController = new BillingController();

// Protected route to initiate checkout
router.post('/create-checkout-session', authenticateToken, billingController.createCheckoutSession);

// Public route for webhook (Stripe calls this)
// Note: Middleware for raw body parsing must be handled in app.ts BEFORE this route is mounted if strictly specific,
// OR this route handles it? Actually, usually app.ts handles the global parsers. 
// We will rely on app.ts to pass the raw body to this specific route or exclude it from JSON parsing.
router.post('/webhook', billingController.handleWebhook);

export default router;
