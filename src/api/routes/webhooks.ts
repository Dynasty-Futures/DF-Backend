import { Router, Request, Response } from 'express';
import { handleWebhookEvent } from '../../services/stripe.service.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// Stripe Webhook Route
// =============================================================================
// Mounted at /webhooks/stripe in app.ts with express.raw() middleware
// so the request body arrives as a raw Buffer for signature verification.

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (!signature || typeof signature !== 'string') {
    logger.warn('Webhook request missing stripe-signature header');
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    await handleWebhookEvent(req.body as Buffer, signature);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Webhook processing failed');
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

export default router;
