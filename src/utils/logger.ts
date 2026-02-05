import pino from 'pino';
import { config } from '../config/index.js';

// =============================================================================
// Logger Configuration
// =============================================================================

const createLogger = (): pino.Logger => {
  const options: pino.LoggerOptions = {
    level: config.logging.level,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings['pid'],
        host: bindings['hostname'],
        service: 'dynasty-futures-api',
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'token',
        'accessToken',
        'refreshToken',
        'secret',
        'apiKey',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  };

  // Pretty print in development
  if (config.isDevelopment) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  // JSON output in production
  return pino(options);
};

export const logger = createLogger();

// =============================================================================
// Child Logger Factory
// =============================================================================

export const createChildLogger = (context: Record<string, unknown>): pino.Logger => {
  return logger.child(context);
};

// =============================================================================
// Request Logger
// =============================================================================

export const requestLogger = (requestId: string, method: string, url: string): pino.Logger => {
  return logger.child({
    requestId,
    method,
    url,
  });
};
