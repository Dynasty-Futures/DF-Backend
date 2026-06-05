// =============================================================================
// YPF Poller
// =============================================================================
// Replaces the legacy Volumetrica webhook surface. YPF v1 has no webhook
// support, so we pull state every minute via `listTenantAccounts` + a tenant
// breach query, then delegate per-account reconciliation to ypf-sync.service.
//
// Persists `lastPollAt` in Redis (keyed by `ypf:poller:lastPollAt`) so the
// breach query can scope to "since last poll" and stay efficient.
// =============================================================================

import { AccountStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import { getRedisClient } from '../utils/redis.js';
import * as ypfSyncService from '../services/ypf-sync.service.js';

const LAST_POLL_KEY = 'ypf:poller:lastPollAt';

const ACTIVE_STATUSES: AccountStatus[] = [
  AccountStatus.EVALUATION,
  AccountStatus.PHASE_2,
  AccountStatus.PASSED,
  AccountStatus.FUNDED,
];

const readLastPollAt = async (): Promise<Date | undefined> => {
  try {
    const redis = getRedisClient();
    if (!redis) return undefined;
    const raw = await redis.get(LAST_POLL_KEY);
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch (err) {
    logger.warn({ err }, 'ypf-poller: failed to read lastPollAt from Redis');
    return undefined;
  }
};

const writeLastPollAt = async (when: Date): Promise<void> => {
  try {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.set(LAST_POLL_KEY, when.toISOString());
  } catch (err) {
    logger.warn({ err }, 'ypf-poller: failed to persist lastPollAt to Redis');
  }
};

export const runYPFPoll = async (): Promise<void> => {
  const startedAt = new Date();
  const lastPollAt = await readLastPollAt();

  logger.debug({ lastPollAt }, 'YPF poll: starting');

  const activeAccounts = await prisma.account.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      deletedAt: null,
      platformAccountId: { not: null },
      platformUserId: { not: null },
    },
    select: {
      id: true,
      platformAccountId: true,
      platformUserId: true,
    },
  });

  if (activeAccounts.length === 0) {
    logger.debug('YPF poll: no active accounts to poll');
    await writeLastPollAt(startedAt);
    return;
  }

  const provider = getTradingPlatformProvider();

  // Bulk-fetch live accounts (one tenant call vs N user-scoped calls)
  const liveAccounts = await provider.listTenantAccounts().catch((err) => {
    logger.warn({ err }, 'YPF poll: listTenantAccounts failed');
    return [];
  });
  const liveByPlatformId = new Map(
    liveAccounts.map((a) => [a.platformAccountId, a]),
  );

  // Scope the breach query to active accounts only
  const platformAccountIds = activeAccounts
    .map((a) => a.platformAccountId)
    .filter((id): id is string => id !== null);

  const breaches = await provider
    .getTenantBreaches(platformAccountIds, lastPollAt)
    .catch((err) => {
      logger.warn({ err }, 'YPF poll: getTenantBreaches failed');
      return [];
    });
  const breachesByPlatformId = new Map<
    string,
    Awaited<ReturnType<typeof provider.getTenantBreaches>>
  >();
  for (const b of breaches) {
    const list = breachesByPlatformId.get(b.platformAccountId) ?? [];
    list.push(b);
    breachesByPlatformId.set(b.platformAccountId, list);
  }

  let processed = 0;
  for (const acct of activeAccounts) {
    if (!acct.platformAccountId) continue;
    const live = liveByPlatformId.get(acct.platformAccountId);
    const localBreaches = breachesByPlatformId.get(acct.platformAccountId);
    try {
      await ypfSyncService.syncAccountFromYPF({
        localAccountId: acct.id,
        ...(live && { liveAccount: live }),
        ...(localBreaches && { liveBreaches: localBreaches }),
      });
      processed++;
    } catch (err) {
      logger.error(
        { err, localAccountId: acct.id },
        'YPF poll: per-account sync failed',
      );
    }
  }

  await writeLastPollAt(startedAt);

  logger.info(
    {
      processed,
      total: activeAccounts.length,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'YPF poll: complete',
  );
};
