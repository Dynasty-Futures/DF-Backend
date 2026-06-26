// =============================================================================
// Journal Routes — /v1/journal
// =============================================================================
// Trader-authored daily journal notes, scoped to one of the trader's accounts.
// Persisted server-side so notes follow the trader across devices.
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as journalService from '../../../services/journal.service.js';
import { ValidationError } from '../../../utils/errors.js';

const router = Router();

// All journal routes require authentication
router.use(authenticate);

// =============================================================================
// Validation
// =============================================================================

const paramsSchema = z.object({
  accountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

const bodySchema = z.object({
  content: z.string().max(20_000),
});

const parseParams = (req: Request): { accountId: string; date: string } => {
  const result = paramsSchema.safeParse(req.params);
  if (!result.success) {
    throw new ValidationError('Invalid path parameters', {
      errors: result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }
  return result.data;
};

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /v1/journal/:accountId/:date
 * Returns the saved entry (content: '' when none exists).
 */
router.get(
  '/:accountId/:date',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId, date } = parseParams(req);
      const entry = await journalService.getEntry(req.user!.id, accountId, date);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /v1/journal/:accountId/:date
 * Create/update the entry. Blank content clears it.
 */
router.put(
  '/:accountId/:date',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId, date } = parseParams(req);
      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        throw new ValidationError('Invalid request body', {
          errors: body.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      const entry = await journalService.saveEntry(
        req.user!.id,
        accountId,
        date,
        body.data.content
      );
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
