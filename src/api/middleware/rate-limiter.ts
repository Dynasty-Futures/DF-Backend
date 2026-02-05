import rateLimit from 'express-rate-limit';
import { config } from '../../config/index.js';
import { RateLimitError } from '../../utils/errors.js';

// =============================================================================
// Rate Limiter Configuration
// =============================================================================

export const rateLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  message: new RateLimitError('Too many requests, please try again later').toJSON(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if behind a proxy
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
           req.ip || 
           'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/ready';
  },
});

// =============================================================================
// Stricter Rate Limiter for Auth Endpoints
// =============================================================================

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: new RateLimitError(
    'Too many authentication attempts, please try again in 15 minutes'
  ).toJSON(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
           req.ip || 
           'unknown';
  },
});
