import { Router, Request, Response } from 'express';
import { handlePaymentWebhook } from '../../services/payment.service.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// Payment Webhook Route
// =============================================================================
// Mounted (with express.raw()) before express.json() in app.ts so the body
// arrives as a raw Buffer for signature verification. The active payment
// provider (config.paymentProvider) verifies the signature and parses the
// event — this route stays processor-agnostic.

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    await handlePaymentWebhook(req.body as Buffer, req.headers);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Webhook processing failed');
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

export default router;
