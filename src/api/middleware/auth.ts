import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { config } from '../../config/index.js';
import { UnauthorizedError, ForbiddenError, TokenExpiredError, InvalidTokenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { findSessionById } from '../../repositories/auth.repository.js';

// =============================================================================
// Express Request Type Augmentation
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware after JWT verification. */
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

// =============================================================================
// JWT Payload
// =============================================================================

export interface JwtPayload {
  sub: string;   // user ID
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  /** Session ID — identifies the Session row this token was issued for.
   *  Used by `authenticate` to enforce single-session-per-user. */
  sid: string;
  iat?: number;
  exp?: number;
}

// =============================================================================
// Authenticate Middleware
// =============================================================================

/**
 * Verifies the Bearer token from the Authorization header and attaches
 * the decoded user payload to `req.user`.
 *
 * Also confirms the token's session (`sid`) still exists in the database.
 * This enforces single-session-per-user: when a user logs in elsewhere,
 * the prior session is deleted and the old token's next request 401s.
 *
 * Throws:
 * - `UnauthorizedError` if no token is provided or the session was invalidated
 * - `TokenExpiredError` if the token has expired
 * - `InvalidTokenError` if the token is malformed or invalid
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7); // strip "Bearer "

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Only accept access tokens (not refresh tokens)
    if (decoded.type !== 'access') {
      throw new InvalidTokenError('Expected an access token');
    }

    if (!decoded.sid) {
      throw new InvalidTokenError('Access token is missing a session identifier');
    }

    // Enforce single-session-per-user: the session row must still exist.
    // If a newer login on another browser deleted this session, fail here.
    const session = await findSessionById(decoded.sid);
    if (!session || session.userId !== decoded.sub) {
      throw new UnauthorizedError('Session has been invalidated');
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new TokenExpiredError('Access token has expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new InvalidTokenError('Invalid access token'));
      return;
    }
    // Re-throw AppErrors (UnauthorizedError, etc.)
    next(error);
  }
};

// =============================================================================
// Optional Authenticate Middleware
// =============================================================================

/**
 * Like `authenticate`, but does NOT throw when no token is present.
 * If a valid token exists, `req.user` is populated; otherwise it stays undefined.
 * Useful for routes that work for both authenticated and anonymous users.
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    if (decoded.type === 'access' && decoded.sid) {
      const session = await findSessionById(decoded.sid);
      if (session && session.userId === decoded.sub) {
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role,
        };
      }
    }

    next();
  } catch {
    // Token invalid / expired – treat as unauthenticated, don't block
    logger.debug('Optional auth: token validation failed, continuing as unauthenticated');
    next();
  }
};

// =============================================================================
// Role Guard Middleware
// =============================================================================

/**
 * Returns middleware that checks whether `req.user.role` is in the allowed set.
 * Must be used **after** `authenticate`.
 *
 * @example
 *   router.get('/admin/users', authenticate, requireRole('ADMIN'), handler);
 *   router.get('/queue', authenticate, requireRole('ADMIN', 'SUPPORT'), handler);
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: roles,
          path: req.path,
        },
        'Access denied: insufficient role'
      );
      next(
        new ForbiddenError(
          `This action requires one of the following roles: ${roles.join(', ')}`
        )
      );
      return;
    }

    next();
  };
};
