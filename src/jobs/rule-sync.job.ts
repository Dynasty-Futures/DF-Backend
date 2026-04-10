import { AccountStatus, ChallengeStatus, ViolationType } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import { failChallenge, advanceChallenge } from '../services/challenge-transition.service.js';

// =============================================================================
// Rule Sync Job
// =============================================================================
// Periodic polling job that syncs account state from Volumetrica.
// Catches rule violations that webhooks may have missed.
// =============================================================================

/** Platform-agnostic status strings (mapped from Volumetrica enums by the provider) */
const PLATFORM_STATUS = {
  CHALLENGE_SUCCESS: 'ChallengeSuccess',
  CHALLENGE_FAILED: 'ChallengeFailed',
  DISABLED: 'Disabled',
} as const;

/**
 * Runs a full sync cycle:
 * 1. Fetches all active platform accounts via bulk API
 * 2. Compares platform status against local DB state
 * 3. Triggers transitions for any mismatches (failed/passed on platform but not locally)
 */
export const runRuleSync = async (): Promise<void> => {
  const startTime = Date.now();
  logger.info('Starting rule sync job');

  try {
    const provider = getTradingPlatformProvider();

    // Get all enabled accounts from the platform
    const platformAccounts = await provider.getBulkAccountsEnabled();

    // Also check recently disabled accounts (last 10 minutes to cover missed webhooks)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const disabledAccounts = await provider.getBulkAccountsDisabled(tenMinutesAgo);

    const allPlatformAccounts = [...platformAccounts, ...disabledAccounts];

    if (allPlatformAccounts.length === 0) {
      logger.debug('No platform accounts to sync');
      return;
    }

    // Get all platform account IDs we know about
    const platformIds = allPlatformAccounts
      .map((a) => a.platformAccountId)
      .filter(Boolean);

    // Find local accounts that match
    const localAccounts = await prisma.account.findMany({
      where: {
        yourPropFirmId: { in: platformIds },
        status: { notIn: [AccountStatus.FAILED, AccountStatus.CLOSED] },
        deletedAt: null,
      },
      include: {
        challenges: {
          where: { status: ChallengeStatus.ACTIVE },
          take: 1,
        },
      },
    });

    const localByPlatformId = new Map(
      localAccounts
        .filter((a): a is typeof a & { yourPropFirmId: string } => a.yourPropFirmId !== null)
        .map((a) => [a.yourPropFirmId, a]),
    );

    let synced = 0;
    let transitioned = 0;

    for (const platformAccount of allPlatformAccounts) {
      const local = localByPlatformId.get(platformAccount.platformAccountId);
      if (!local) continue;

      synced++;

      // Sync balance data from platform
      await prisma.account.update({
        where: { id: local.id },
        data: {
          currentBalance: platformAccount.balance,
          highWaterMark: platformAccount.maxBalance,
        },
      });

      // Check for status mismatches
      const platformStatus = platformAccount.status;

      if (
        platformStatus === PLATFORM_STATUS.CHALLENGE_FAILED ||
        platformStatus === PLATFORM_STATUS.DISABLED
      ) {
        if (local.status !== AccountStatus.FAILED) {
          logger.warn(
            { accountId: local.id, platformStatus },
            'Platform shows failed/disabled but local is not failed — triggering transition',
          );
          await failChallenge(
            local.id,
            'Rule violation detected by platform (sync)',
            ViolationType.OTHER,
          );
          transitioned++;
        }
      } else if (platformStatus === PLATFORM_STATUS.CHALLENGE_SUCCESS) {
        if (local.status !== AccountStatus.FUNDED && local.status !== AccountStatus.PASSED) {
          logger.info(
            { accountId: local.id },
            'Platform shows challenge success — triggering advance',
          );
          await advanceChallenge(local.id);
          transitioned++;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      { synced, transitioned, elapsed: `${elapsed}ms` },
      'Rule sync job completed',
    );
  } catch (err) {
    logger.error({ err }, 'Rule sync job failed');
  }
};
