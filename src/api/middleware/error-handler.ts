import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError, InternalError, isAppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

// =============================================================================
// Error Handler Middleware
// =============================================================================

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the error
  const requestId = req.headers['x-request-id'] as string | undefined;
  
  logger.error({
    err,
    requestId,
    method: req.method,
    url: req.url,
    body: req.body,
    query: req.query,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const validationError = new ValidationError('Validation failed', {
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });

    res.status(validationError.statusCode).json(validationError.toJSON());
    return;
  }

  // Handle known application errors
  if (isAppError(err)) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Handle unknown errors
  const internalError = new InternalError(
    config.isProduction ? 'An unexpected error occurred' : err.message
  );

  res.status(internalError.statusCode).json(internalError.toJSON());
};

// =============================================================================
// Not Found Handler
// =============================================================================

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
};

// =============================================================================
// Async Handler Wrapper
// =============================================================================

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export const asyncHandler = (fn: AsyncHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
