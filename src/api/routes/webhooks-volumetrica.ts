import { Router, Request, Response } from 'express';
import { config } from '../../config/index.js';
import { handleWebhookEvent } from '../../services/volumetrica-webhook.service.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// Volumetrica Webhook Route
// =============================================================================
// Mounted at /webhooks/volumetrica in app.ts.
// Validates the x-webhook-secret header against VOLUMETRICA_WEBHOOK_SECRET.

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const secret = req.headers['x-webhook-secret'];

  if (config.isProduction && !config.volumetrica.webhookSecret) {
    logger.error('VOLUMETRICA_WEBHOOK_SECRET not configured in production');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  if (config.volumetrica.webhookSecret) {
    if (!secret || secret !== config.volumetrica.webhookSecret) {
      logger.warn('Volumetrica webhook request with invalid or missing secret');
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }
  }

  try {
    await handleWebhookEvent(req.body);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Volumetrica webhook processing failed');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
