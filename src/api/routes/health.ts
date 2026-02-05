import { Router, Request, Response } from 'express';
import { isDatabaseHealthy } from '../../utils/database.js';
import { isRedisHealthy } from '../../utils/redis.js';

// =============================================================================
// Health Check Routes
// =============================================================================

const router = Router();

/**
 * GET /health
 * Basic health check - returns 200 if the server is running
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready
 * Readiness check - returns 200 only if all dependencies are healthy
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const checks = {
    database: await isDatabaseHealthy(),
    redis: await isRedisHealthy(),
  };

  const allHealthy = Object.values(checks).every(Boolean);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /live
 * Liveness check - returns 200 if the server is running (for Kubernetes)
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export default router;
