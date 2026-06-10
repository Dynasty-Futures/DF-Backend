import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { payoutService } from '../../../services/index.js';
import { ValidationError } from '../../../utils/errors.js';

// =============================================================================
// Payout Routes — /v1/payouts
// =============================================================================
// Trader-facing. Eligibility, profit-split, approval, and the Rise money rail
// are owned by YPF; these endpoints surface withdrawable profit, submit the
// request to YPF, and return the mirrored history.
// =============================================================================

const router = Router();

router.use(authenticate);

// ── Validation ───────────────────────────────────────────────────────────────

// Bank details are forwarded to YPF and never persisted locally (pass-through).
const bankDetailsSchema = z.object({
  accountHolder: z.string().trim().min(1, 'Account holder is required').max(200),
  accountNumber: z.string().trim().min(1, 'Account number is required').max(64),
  swiftBic: z.string().trim().min(1, 'SWIFT/BIC is required').max(34),
  currency: z.string().trim().length(3, 'Currency must be a 3-letter code').toUpperCase(),
});

const requestPayoutSchema = z.object({
  accountId: z.string().uuid('Invalid account id'),
  amount: z.number().positive('Payout amount must be greater than zero'),
  payoutDetails: bankDetailsSchema,
});

const validateBody = <T extends z.ZodSchema>(schema: T) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError('Validation failed', { errors }));
      return;
    }
    req.body = result.data;
    next();
  };
};

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /v1/payouts/eligible-accounts
 * Funded accounts with withdrawable profit for the authenticated trader.
 */
router.get(
  '/eligible-accounts',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accounts = await payoutService.getEligibleAccounts(req.user!.id);
      res.json({ success: true, data: accounts });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v1/payouts
 * Payout history for the authenticated trader.
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payouts = await payoutService.getPayoutHistory(req.user!.id);
      res.json({ success: true, data: payouts });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v1/payouts/:id
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payout = await payoutService.getPayoutById(
        req.user!.id,
        req.params['id'] as string
      );
      res.json({ success: true, data: payout });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v1/payouts
 * Submit a payout request to YPF for review.
 */
router.post(
  '/',
  validateBody(requestPayoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as z.infer<typeof requestPayoutSchema>;
      const payout = await payoutService.requestPayout({
        userId: req.user!.id,
        accountId: body.accountId,
        amount: body.amount,
        payoutDetails: body.payoutDetails,
      });
      res.status(201).json({
        success: true,
        data: payout,
        message: 'Payout request submitted for review',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
