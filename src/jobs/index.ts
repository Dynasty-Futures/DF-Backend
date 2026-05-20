import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { runYPFPoll } from './ypf-poller.job.js';

// =============================================================================
// Background Jobs
// =============================================================================

export const startBackgroundJobs = (): void => {
  if (config.isTest) {
    logger.debug('Skipping background jobs in test environment');
    return;
  }

  const schedule = config.ypf.pollCron;

  cron.schedule(schedule, () => {
    runYPFPoll().catch((err) => {
      logger.error({ err }, 'Unhandled error in YPF poller');
    });
  });

  logger.info({ schedule }, 'YPF poller started');
};
