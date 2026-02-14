import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../../../services/index.js';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

// =============================================================================
// Auth Routes
// =============================================================================

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be at most 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit'
    ),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
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
 * POST /auth/register
 * Create a new user account with email & password.
 * Returns the user profile and JWT token pair.
 */
router.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, firstName, lastName } = req.body as z.infer<typeof registerSchema>;

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
      });

      logger.info(
        { userId: result.user.id, email: result.user.email, ip: req.ip },
        'User registered via API'
      );

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        message: 'Registration successful',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/login
 * Authenticate with email & password.
 * Returns the user profile and JWT token pair.
 */
router.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      const result = await authService.login({
        email,
        password,
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
      });

      logger.info(
        { userId: result.user.id, ip: req.ip },
        'User logged in via API'
      );

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        message: 'Login successful',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/google
 * Authenticate or register via Google SSO.
 * Accepts a Google ID token obtained on the frontend via Google Identity Services.
 * Returns the user profile and JWT token pair.
 */
router.post(
  '/google',
  authRateLimiter,
  validateBody(googleAuthSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken } = req.body as z.infer<typeof googleAuthSchema>;

      const result = await authService.googleAuth({
        idToken,
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
      });

      logger.info(
        { userId: result.user.id, ip: req.ip },
        'User authenticated via Google SSO'
      );

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        message: 'Google authentication successful',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/refresh
 * Issue a new access token using a valid refresh token.
 * The refresh token itself is NOT rotated — it stays valid until expiry or logout.
 */
router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as z.infer<typeof refreshSchema>;

      const result = await authService.refreshAccessToken(refreshToken);

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
        message: 'Token refreshed',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/logout
 * Invalidate the session associated with the given refresh token.
 * Requires authentication.
 */
router.post(
  '/logout',
  authenticate,
  validateBody(logoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as z.infer<typeof logoutSchema>;

      await authService.logout(refreshToken);

      logger.info({ userId: req.user?.id }, 'User logged out via API');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /auth/me
 * Get the currently authenticated user's profile.
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // authenticate middleware guarantees req.user exists
      const userId = req.user?.id;
      if (!userId) {
        next(new ValidationError('User context missing'));
        return;
      }

      const user = await authService.getMe(userId);

      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
