import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import * as accountDiscoveryService from '../../../services/account-discovery.service.js';

// =============================================================================
// Inbound Webhook Routes (YPF)
// =============================================================================
// YPF posts here when a new trading account is created on the WooCommerce/Worthy
// checkout (registered in YPF admin → DEV space → Web Hooks). The webhook is a
// real-time *trigger* for the existing account-discovery sweep — it never trusts
// the request body for account data (discovery re-reads everything from YPF's
// authenticated Client API), so a spoofed call can't inject a fake account. The
// shared secret is therefore abuse/DoS protection, not a trust boundary.
//
// The 2-minute discovery poll stays on as a fallback for any missed delivery.
// =============================================================================

const router = Router();

// Timing-safe secret comparison (avoids leaking match progress via response time).
const secretsMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// Pull the secret from whichever channel YPF's webhook config supports: a custom
// header, an Authorization bearer, or a query token.
const extractSecret = (req: Request): string | undefined => {
  const header = req.header('x-webhook-secret');
  if (header) return header;

  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

  const query = req.query['secret'] ?? req.query['token'];
  if (typeof query === 'string') return query;

  return undefined;
};

/**
 * POST /webhooks/ypf
 * Real-time trigger for account discovery on a new YPF account.
 *
 * Auth: shared secret (header `X-Webhook-Secret`, `Authorization: Bearer`, or
 * `?secret=`/`?token=`). Returns 503 when no secret is configured (disabled),
 * 401 on a bad/missing secret. On success acks 202 immediately and runs the
 * coalesced discovery sweep fire-and-forget.
 */
router.post('/ypf', (req: Request, res: Response): void => {
  const expected = config.ypf.webhook.secret;
  if (!expected) {
    res.status(503).json({
      success: false,
      message: 'Webhook not configured',
    });
    return;
  }

  const provided = extractSecret(req);
  if (!provided || !secretsMatch(provided, expected)) {
    logger.warn({ ip: req.ip }, 'ypf-webhook: rejected — bad or missing secret');
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  // Body is logged for observability only — never used as the source of truth.
  // YPF's event identifier field name isn't contractually fixed, so log the
  // first of the likely keys (e.g. AccountCreated).
  const body = (req.body ?? {}) as Record<string, unknown>;
  const eventName =
    body['event'] ?? body['type'] ?? body['eventType'] ?? body['name'];
  logger.info({ event: eventName, ip: req.ip }, 'ypf-webhook: received event');

  // Master switch: when discovery is disabled the poll is off too, so don't let
  // the webhook create accounts out-of-band. Ack so YPF doesn't retry.
  if (!config.ypf.discovery.enabled) {
    logger.info('ypf-webhook: discovery disabled — acked without sweeping');
    res.status(202).json({ success: true, triggered: false });
    return;
  }

  accountDiscoveryService.triggerDiscoverySweep('ypf-webhook');
  res.status(202).json({ success: true, triggered: true });
});

export default router;
