import { Request, Response } from 'express';
import Stripe from 'stripe';
import pool from '../database/db';

// Stripe is optional (see README). Lazy-init so the app still boots without keys.
const stripeKey = process.env.STRIPE_SECRET_KEY;
let stripe: Stripe | null = null;
if (stripeKey) {
    try {
        stripe = new Stripe(stripeKey);
    } catch (err) {
        console.warn('[BillingController] Invalid STRIPE_SECRET_KEY. Stripe features disabled.');
    }
}

export class BillingController {

    public createCheckoutSession = async (req: Request | any, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!stripe) {
                res.status(503).json({ error: 'Billing is not configured on this server.' });
                return;
            }

            // Get user email to pre-fill in Stripe (optional but nice)
            const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
            const userEmail = result.rows[0]?.email;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'subscription',
                line_items: [
                    {
                        price: process.env.STRIPE_PRICE_ID,
                        quantity: 1,
                    },
                ],
                customer_email: userEmail, // Pre-fill email
                client_reference_id: userId.toString(), // Pass userId to webhook
                success_url: `${process.env.CLIENT_URL}/profile?success=true`,
                cancel_url: `${process.env.CLIENT_URL}/profile?canceled=true`,
                // metadata: { userId: userId.toString() } // Redundant if using client_reference_id but good backup
            });

            res.status(200).json({ url: session.url });
        } catch (error) {
            console.error('Error creating checkout session:', error);
            res.status(500).json({ error: 'Failed to create checkout session' });
        }
    };

    public handleWebhook = async (req: Request, res: Response): Promise<void> => {
        const sig = req.headers['stripe-signature'] as string;
        let event: Stripe.Event;

        if (!stripe) {
            res.status(503).send('Billing is not configured on this server.');
            return;
        }

        try {
            // req.body must be raw buffer here. app.ts configuration is crucial.
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET || ''
            );
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    await this.handleCheckoutSessionCompleted(session);
                    break;
                case 'customer.subscription.deleted':
                    const subscription = event.data.object as Stripe.Subscription;
                    await this.handleSubscriptionDeleted(subscription);
                    break;
                default:
                    console.log(`Unhandled event type ${event.type}`);
            }
            res.status(200).send();
        } catch (error) {
            console.error('Error handling webhook event:', error);
            res.status(500).send('Internal Server Error');
        }
    };

    private handleCheckoutSessionCompleted = async (session: Stripe.Checkout.Session) => {
        const userId = session.client_reference_id;
        const stripeCustomerId = session.customer as string;

        if (!userId) {
            console.error('No userId found in checkout session client_reference_id');
            return;
        }

        // Update user to premium
        const query = `
            UPDATE users 
            SET subscription_status = 'premium', 
                stripe_customer_id = $1,
                updated_at = NOW()
            WHERE id = $2
        `;
        await pool.query(query, [stripeCustomerId, userId]);
        console.log(`User ${userId} upgraded to premium.`);
    };

    private handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
        const stripeCustomerId = subscription.customer as string;

        // Revert user to free
        const query = `
            UPDATE users 
            SET subscription_status = 'free', 
                updated_at = NOW()
            WHERE stripe_customer_id = $1
        `;
        await pool.query(query, [stripeCustomerId]);
        console.log(`Customer ${stripeCustomerId} downgraded to free.`);
    };
}
