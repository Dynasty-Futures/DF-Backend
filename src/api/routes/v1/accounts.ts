import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AccountStatus, UserRole } from '@prisma/client';
import { accountService } from '../../../services/index.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../../utils/errors.js';

// =============================================================================
// Account Routes
// =============================================================================

const router = Router();

// All account routes require authentication + admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

// =============================================================================
// Validation Schemas
// =============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'currentBalance', 'status', 'totalPnl', 'currentDrawdown']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const accountFiltersSchema = z.object({
  status: z.nativeEnum(AccountStatus).optional(),
  accountTypeId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

// =============================================================================
// Validation Middleware
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

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /accounts
 * List all accounts (admin only). Supports filtering and pagination.
 */
router.get(
  '/',
  validateQuery(paginationSchema.merge(accountFiltersSchema)),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, sortBy, sortOrder, ...filters } = req.query as unknown as z.infer<
        typeof paginationSchema
      > &
        z.infer<typeof accountFiltersSchema>;

      const result = await accountService.listAccounts(filters, {
        page,
        limit,
        sortBy,
        sortOrder,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /accounts/stats
 * Get account statistics (admin only).
 */
router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await accountService.getStatistics();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /accounts/:id
 * Get a single account by ID (admin only).
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = req.params['id'] as string;
      const account = await accountService.getAccount(accountId);

      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
