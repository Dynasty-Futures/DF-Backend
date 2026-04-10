import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { runRuleSync } from './rule-sync.job.js';

// =============================================================================
// Background Jobs
// =============================================================================
// Cron-based jobs that run periodically for platform data synchronization.
// Only started in non-test environments.
// =============================================================================

/**
 * Starts all background jobs.
 * Call this after the server starts listening.
 */
export const startBackgroundJobs = (): void => {
  if (config.isTest) {
    logger.debug('Skipping background jobs in test environment');
    return;
  }

  // Rule sync: every 5 minutes on weekdays (futures markets closed on weekends)
  cron.schedule('*/5 * * * 1-5', () => {
    runRuleSync().catch((err) => {
      logger.error({ err }, 'Unhandled error in rule sync job');
    });
  });

  logger.info('Background jobs started (rule-sync: every 5 min, weekdays)');
};
