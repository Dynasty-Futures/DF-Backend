import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  rateLimiter,
} from './api/middleware/index.js';
import healthRoutes from './api/routes/health.js';
import v1Routes from './api/routes/v1/index.js';

// =============================================================================
// Create Express Application
// =============================================================================

export const createApp = (): Application => {
  const app = express();

  // ==========================================================================
  // Trust Proxy (for running behind ALB/nginx)
  // ==========================================================================
  app.set('trust proxy', 1);

  // ==========================================================================
  // Security Middleware
  // ==========================================================================
  
  // Helmet - Security headers
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction,
      crossOriginEmbedderPolicy: config.isProduction,
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  // Rate limiting
  app.use(rateLimiter);

  // ==========================================================================
  // Request Processing Middleware
  // ==========================================================================

  // Request ID
  app.use(requestIdMiddleware);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  if (config.isDevelopment) {
    app.use(morgan('dev'));
  } else {
    // Structured logging in production
    app.use(
      morgan(
        (tokens, req, res) => {
          return JSON.stringify({
            method: tokens['method']?.(req, res) ?? '-',
            url: tokens['url']?.(req, res) ?? '-',
            status: tokens['status']?.(req, res) ?? '-',
            contentLength: tokens['res']?.(req, res, 'content-length') ?? '-',
            responseTime: `${tokens['response-time']?.(req, res) ?? '0'}ms`,
            requestId: req.requestId,
          });
        },
        {
          stream: {
            write: (message: string) => {
              logger.info(JSON.parse(message.trim()));
            },
          },
        }
      )
    );
  }

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Health checks (no prefix)
  app.use(healthRoutes);

  // API v1 routes
  app.use('/v1', v1Routes);

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
};
