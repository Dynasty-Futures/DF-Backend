import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { affiliateService } from '../../../services/index.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

// =============================================================================
// Affiliate Routes
// =============================================================================

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

// Empty string is coerced to undefined so blank optional URL fields don't fail
// the .url() check.
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url('Must be a valid URL').max(500).optional()
);

const applySchema = z
  .object({
    websiteUrl: optionalUrl,
    youtubeUrl: optionalUrl,
    xUrl: optionalUrl,
    instagramUrl: optionalUrl,
    facebookUrl: optionalUrl,
    telegramUrl: optionalUrl,
    discordUrl: optionalUrl,
    isFundedTrader: z.boolean(),
    hasActiveDynastyAccount: z.boolean(),
    promotionPlan: z.string().min(1, 'Promotion plan is required').max(5000),
    primaryTrafficMethod: z.string().min(1, 'Primary traffic method is required').max(5000),
    createsCustomContent: z.boolean(),
    contentUpdateFrequency: z.string().min(1, 'This field is required').max(5000),
    preferredAffiliateCode: z
      .string()
      .min(1, 'Preferred affiliate code is required')
      .max(100),
    restrictedJurisdictionConfirmation: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm this statement to proceed' }),
    }),
  })
  .refine(
    (data) =>
      [
        data.websiteUrl,
        data.youtubeUrl,
        data.xUrl,
        data.instagramUrl,
        data.facebookUrl,
        data.telegramUrl,
        data.discordUrl,
      ].some(Boolean),
    {
      message: 'At least one website or social URL is required',
      path: ['websiteUrl'],
    }
  );

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

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /affiliates/apply
 * Submit an affiliate program application.
 * Public endpoint — `optionalAuthenticate` attaches the user when logged in so
 * we can capture their email/ID, but anonymous submissions are accepted too.
 */
router.post(
  '/apply',
  optionalAuthenticate,
  validateBody(applySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as z.infer<typeof applySchema>;

      const application = await affiliateService.submitApplication({
        ...body,
        creatorId: req.user?.id,
        applicantEmail: req.user?.email,
      });

      logger.info(
        { applicationId: application.id, userId: req.user?.id, ip: req.ip },
        'Affiliate application submitted via API'
      );

      res.status(201).json({
        success: true,
        data: { id: application.id, status: application.status },
        message: 'Affiliate application submitted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /affiliates/me
 * The current user's affiliate status, referral code, and discount coupons —
 * sourced from webhook-mirrored state. Earnings/performance/tier data require
 * the affiliate-platform service token and are not included.
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await affiliateService.getMyAffiliateStatus(req.user!.id);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
