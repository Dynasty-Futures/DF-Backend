import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { createCheckoutSession } from '../../../services/stripe.service.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

// =============================================================================
// Checkout Routes
// =============================================================================

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const createSessionSchema = z.object({
  planType: z.enum(['standard', 'advanced', 'dynasty'], {
    errorMap: () => ({ message: 'Plan type must be standard, advanced, or dynasty' }),
  }),
  accountSize: z.enum(['25000', '50000', '100000', '150000'], {
    errorMap: () => ({ message: 'Account size must be 25000, 50000, 100000, or 150000' }),
  }).transform(Number)
    .or(
      z.number().refine(
        (val) => [25000, 50000, 100000, 150000].includes(val),
        { message: 'Account size must be 25000, 50000, 100000, or 150000' }
      )
    ),
});

// =============================================================================
// Validation Middleware
// =============================================================================

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
 * POST /checkout/create-session
 * Creates a Stripe Checkout Session for the authenticated user.
 * Returns the Stripe-hosted checkout URL.
 */
router.post(
  '/create-session',
  authenticate,
  validateBody(createSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const email = req.user!.email;
      const { planType, accountSize } = req.body as z.infer<typeof createSessionSchema>;

      logger.info(
        { userId, planType, accountSize },
        'Checkout session requested'
      );

      const result = await createCheckoutSession({
        userId,
        email,
        planType,
        accountSize,
      });

      res.json({
        success: true,
        data: {
          checkoutUrl: result.checkoutUrl,
        },
        message: 'Checkout session created',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
