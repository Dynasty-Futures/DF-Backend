import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole, UserStatus } from '@prisma/client';
import { userService } from '../../../services/index.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

// =============================================================================
// User Routes
// =============================================================================

const router = Router();

// All user routes require authentication
router.use(authenticate);

// =============================================================================
// Validation Schemas
// =============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'email', 'lastName', 'role', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const userFiltersSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().max(100).optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
});

const adminUpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

const changeRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

const changeStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
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
 * GET /users
 * List all users (admin only). Supports filtering and pagination.
 */
router.get(
  '/',
  requireRole(UserRole.ADMIN),
  validateQuery(paginationSchema.merge(userFiltersSchema)),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, sortBy, sortOrder, ...filters } = req.query as unknown as z.infer<
        typeof paginationSchema
      > &
        z.infer<typeof userFiltersSchema>;

      const result = await userService.listUsers(filters, {
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
 * GET /users/stats
 * Get user statistics (admin only).
 */
router.get(
  '/stats',
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await userService.getStatistics();

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
 * GET /users/:id
 * Get a user by ID.
 * - Admins can fetch any user.
 * - Non-admins can only fetch their own profile.
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params['id'] as string;
      const requesterId = req.user?.id;
      const requesterRole = req.user?.role;

      if (!requesterId || !requesterRole) {
        next(new ValidationError('User context missing'));
        return;
      }

      const user = await userService.getUser(targetId, requesterId, requesterRole);

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /users/:id
 * Update a user.
 * - Non-admins can only update their own profile (firstName, lastName, phone).
 * - Admins can update any user, including role and status.
 */
router.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params['id'] as string;
      const requesterId = req.user?.id;
      const requesterRole = req.user?.role;

      if (!requesterId || !requesterRole) {
        next(new ValidationError('User context missing'));
        return;
      }

      let user;

      if (requesterRole === UserRole.ADMIN) {
        // Admin: use the extended schema
        const parsed = adminUpdateUserSchema.safeParse(req.body);
        if (!parsed.success) {
          const errors = parsed.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));
          next(new ValidationError('Validation failed', { errors }));
          return;
        }

        user = await userService.adminUpdate(targetId, parsed.data, requesterId);

        logger.info(
          { targetId, updates: Object.keys(parsed.data), adminId: requesterId },
          'Admin updated user via API'
        );
      } else {
        // Self-service: only profile fields
        if (targetId !== requesterId) {
          next(new ValidationError('You can only update your own profile'));
          return;
        }

        const parsed = updateProfileSchema.safeParse(req.body);
        if (!parsed.success) {
          const errors = parsed.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));
          next(new ValidationError('Validation failed', { errors }));
          return;
        }

        user = await userService.updateProfile(targetId, parsed.data);
      }

      res.json({
        success: true,
        data: user,
        message: 'User updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /users/:id/role
 * Change a user's role (admin only).
 */
router.patch(
  '/:id/role',
  requireRole(UserRole.ADMIN),
  validateBody(changeRoleSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params['id'] as string;
      const { role } = req.body as z.infer<typeof changeRoleSchema>;
      const adminId = req.user?.id;

      if (!adminId) {
        next(new ValidationError('User context missing'));
        return;
      }

      const user = await userService.changeUserRole(targetId, role, adminId);

      logger.info(
        { targetId, newRole: role, adminId },
        'User role changed via API'
      );

      res.json({
        success: true,
        data: user,
        message: `User role changed to ${role}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /users/:id/status
 * Change a user's status (admin only).
 */
router.patch(
  '/:id/status',
  requireRole(UserRole.ADMIN),
  validateBody(changeStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params['id'] as string;
      const { status } = req.body as z.infer<typeof changeStatusSchema>;
      const adminId = req.user?.id;

      if (!adminId) {
        next(new ValidationError('User context missing'));
        return;
      }

      const user = await userService.changeUserStatus(targetId, status, adminId);

      logger.info(
        { targetId, newStatus: status, adminId },
        'User status changed via API'
      );

      res.json({
        success: true,
        data: user,
        message: `User status changed to ${status}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /users/:id
 * Soft-delete a user (admin only).
 */
router.delete(
  '/:id',
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params['id'] as string;
      const adminId = req.user?.id;

      if (!adminId) {
        next(new ValidationError('User context missing'));
        return;
      }

      await userService.deleteUser(targetId, adminId);

      logger.info({ targetId, adminId }, 'User deleted via API');

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
