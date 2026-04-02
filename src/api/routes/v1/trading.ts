// =============================================================================
// Trading Routes — /v1/trading
// =============================================================================
// Exposes trading account data to the frontend. Each endpoint is annotated with
// its data strategy (LIVE vs STORED) per the hybrid architecture.
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as tradingService from '../../../services/trading.service.js';
import { ValidationError } from '../../../utils/errors.js';

const router = Router();

// All trading routes require authentication
router.use(authenticate);

// =============================================================================
// Validation
// =============================================================================

const validateQuery = <T extends z.ZodSchema>(schema: T) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError('Invalid query parameters', { errors }));
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
};

const liveQuerySchema = z.object({
  live: z.coerce.boolean().default(false),
});

const reportQuerySchema = z.object({
  startDt: z.coerce.date(),
  endDt: z.coerce.date().optional(),
});

const iframeQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /v1/trading/accounts
 * **STORED** — list the authenticated user's accounts from Prisma.
 * Supports `?live=true` to refresh from the trading platform first.
 */
router.get(
  '/accounts',
  validateQuery(liveQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { live } = req.query as unknown as { live: boolean };
      const accounts = await tradingService.getUserAccounts(req.user!.id, live);

      res.json({ success: true, data: accounts });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/accounts/:id
 * **STORED + LIVE merge** — local metadata + live snapshot from provider.
 */
router.get(
  '/accounts/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.params['id'] as string;
      const account = await tradingService.getAccountDetail(accountId, req.user!.id);

      res.json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/accounts/:id/live
 * **LIVE** — real-time balance, equity, P&L direct from provider.
 */
router.get(
  '/accounts/:id/live',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.params['id'] as string;
      const snapshot = await tradingService.getAccountLiveSnapshot(accountId, req.user!.id);

      res.json({ success: true, data: snapshot });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/accounts/:id/report
 * **LIVE** — proxy to provider report (computed on-demand).
 */
router.get(
  '/accounts/:id/report',
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startDt, endDt } = req.query as unknown as {
        startDt: Date;
        endDt?: Date;
      };

      const accountId = req.params['id'] as string;
      const report = await tradingService.getAccountReport(accountId, req.user!.id, startDt, endDt);

      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/accounts/:id/snapshots
 * **STORED** — daily snapshots from Prisma. Supports `?live=true`.
 */
router.get(
  '/accounts/:id/snapshots',
  validateQuery(liveQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { live } = req.query as unknown as { live: boolean };
      const accountId = req.params['id'] as string;
      const snapshots = await tradingService.getAccountSnapshots(accountId, req.user!.id, live);

      res.json({ success: true, data: snapshots });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/accounts/:id/trades
 * **STORED** — historical trades from Prisma. Supports `?live=true`.
 */
router.get(
  '/accounts/:id/trades',
  validateQuery(liveQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { live } = req.query as unknown as { live: boolean };
      const accountId = req.params['id'] as string;
      const trades = await tradingService.getAccountTrades(accountId, req.user!.id, live);

      res.json({ success: true, data: trades });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /v1/trading/accounts/:id/reset
 * **LIVE + on-write sync** — reset on provider, update Prisma.
 */
router.post(
  '/accounts/:id/reset',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.params['id'] as string;
      const result = await tradingService.resetAccount(accountId, req.user!.id);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/dashboard-url
 * **LIVE** — one-time-use token from provider.
 */
router.get(
  '/dashboard-url',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await tradingService.getDashboardUrl(req.user!.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /v1/trading/iframe-url
 * **LIVE** — iFrame embed URL from provider.
 */
router.get(
  '/iframe-url',
  validateQuery(iframeQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.query as unknown as { accountId?: string };
      const result = await tradingService.getIFrameUrl(req.user!.id, accountId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
