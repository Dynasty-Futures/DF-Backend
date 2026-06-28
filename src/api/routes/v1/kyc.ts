// =============================================================================
// KYC Routes — /v1/kyc
// =============================================================================
// Identity verification (Sumsub) is hosted by YPF. These endpoints let a trader
// see their up-to-date verification status (synced from YPF) and initiate the
// flow; the actual document capture happens in YPF's portal (hand-off).
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { kycService } from '../../../services/index.js';
import { UnauthorizedError } from '../../../utils/errors.js';

const router = Router();

router.use(authenticate);

const requireUserId = (req: Request): string => {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedError('Authentication required');
  return id;
};

/**
 * GET /v1/kyc
 * Refresh the trader's KYC status from YPF and return it.
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await kycService.syncUserKyc(requireUserId(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /v1/kyc/request
 * Initiate identity verification on YPF (prompts the Sumsub flow), then return
 * the refreshed status.
 */
router.post(
  '/request',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await kycService.requestKyc(requireUserId(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
