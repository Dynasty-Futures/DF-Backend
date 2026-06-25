import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { runYPFPoll } from './ypf-poller.job.js';
import { runAccountDiscovery } from './account-discovery.job.js';

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

  // Pull-based provisioning — off by default (see ACCOUNT_DISCOVERY_ENABLED).
  if (config.ypf.discovery.enabled) {
    const discoverySchedule = config.ypf.discovery.cron;

    cron.schedule(discoverySchedule, () => {
      runAccountDiscovery().catch((err) => {
        logger.error({ err }, 'Unhandled error in account discovery');
      });
    });

    logger.info(
      { schedule: discoverySchedule, statuses: config.ypf.discovery.statuses },
      'Account discovery started',
    );
  } else {
    logger.info('Account discovery disabled (ACCOUNT_DISCOVERY_ENABLED=false)');
  }
};
