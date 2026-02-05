// =============================================================================
// Custom Error Classes
// =============================================================================

export interface ErrorDetails {
  [key: string]: unknown;
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational = true,
    details?: ErrorDetails
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// =============================================================================
// HTTP Error Classes
// =============================================================================

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: ErrorDetails) {
    super(message, 'BAD_REQUEST', 400, true, details);
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: ErrorDetails) {
    super(message, 'UNAUTHORIZED', 401, true, details);
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: ErrorDetails) {
    super(message, 'FORBIDDEN', 403, true, details);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: ErrorDetails) {
    super(message, 'NOT_FOUND', 404, true, details);
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: ErrorDetails) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

/**
 * 422 Unprocessable Entity (Validation Error)
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: ErrorDetails) {
    super(message, 'VALIDATION_ERROR', 422, true, details);
  }
}

/**
 * 429 Too Many Requests
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: ErrorDetails) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, details);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: ErrorDetails) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: ErrorDetails) {
    super(message, 'SERVICE_UNAVAILABLE', 503, true, details);
  }
}

// =============================================================================
// Domain-Specific Errors
// =============================================================================

/**
 * Authentication errors
 */
export class AuthenticationError extends UnauthorizedError {
  constructor(message = 'Authentication failed', details?: ErrorDetails) {
    super(message, details);
    this.code = 'AUTHENTICATION_ERROR';
  }
}

/**
 * Token expired
 */
export class TokenExpiredError extends UnauthorizedError {
  constructor(message = 'Token expired', details?: ErrorDetails) {
    super(message, details);
    this.code = 'TOKEN_EXPIRED';
  }
}

/**
 * Invalid token
 */
export class InvalidTokenError extends UnauthorizedError {
  constructor(message = 'Invalid token', details?: ErrorDetails) {
    super(message, details);
    this.code = 'INVALID_TOKEN';
  }
}

/**
 * Account not found
 */
export class AccountNotFoundError extends NotFoundError {
  constructor(accountId?: string) {
    super(
      accountId ? `Account ${accountId} not found` : 'Account not found',
      accountId ? { accountId } : undefined
    );
    this.code = 'ACCOUNT_NOT_FOUND';
  }
}

/**
 * User not found
 */
export class UserNotFoundError extends NotFoundError {
  constructor(userId?: string) {
    super(
      userId ? `User ${userId} not found` : 'User not found',
      userId ? { userId } : undefined
    );
    this.code = 'USER_NOT_FOUND';
  }
}

/**
 * Account suspended
 */
export class AccountSuspendedError extends ForbiddenError {
  constructor(reason?: string) {
    super(
      reason ? `Account suspended: ${reason}` : 'Account suspended',
      reason ? { reason } : undefined
    );
    this.code = 'ACCOUNT_SUSPENDED';
  }
}

/**
 * Rule violation
 */
export class RuleViolationError extends AppError {
  constructor(violationType: string, message: string, details?: ErrorDetails) {
    super(message, 'RULE_VIOLATION', 400, true, { violationType, ...details });
  }
}

/**
 * Insufficient funds
 */
export class InsufficientFundsError extends BadRequestError {
  constructor(message = 'Insufficient funds', details?: ErrorDetails) {
    super(message, details);
    this.code = 'INSUFFICIENT_FUNDS';
  }
}

/**
 * Payment error
 */
export class PaymentError extends AppError {
  constructor(message = 'Payment failed', details?: ErrorDetails) {
    super(message, 'PAYMENT_ERROR', 402, true, details);
  }
}

// =============================================================================
// Error Type Guards
// =============================================================================

export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

export const isOperationalError = (error: unknown): boolean => {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
};
