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
import * as payoutService from '../services/payout.service.js';
import type { PlatformAccountResult } from '../providers/types.js';

const LAST_POLL_KEY = 'ypf:poller:lastPollAt';

const ACTIVE_STATUSES: AccountStatus[] = [
  AccountStatus.EVALUATION,
  AccountStatus.PHASE_2,
  AccountStatus.PASSED,
  AccountStatus.FUNDED,
];

// YPF AccountState values to pull each poll. /tenant/accounts requires a status
// filter, so we sweep these and merge: Active + Breached reconcile our live
// accounts (incl. just-passed funded accounts, still reported Active), and
// Disabled feeds the soft-delete cleanup.
const POLL_STATUSES = ['Active', 'Breached', 'Disabled'];

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

// Soft-delete every non-deleted local account that YPF reports as Disabled
// (permanently removed upstream). Uses the bulk live map so it covers ALL local
// accounts — active and already-failed — in one pass.
const removeDisabledAccounts = async (
  liveByPlatformId: Map<string, PlatformAccountResult>,
): Promise<void> => {
  const locals = await prisma.account.findMany({
    where: { deletedAt: null, platformAccountId: { not: null } },
    select: { id: true, platformAccountId: true },
  });

  let removed = 0;
  for (const a of locals) {
    if (!a.platformAccountId) continue;
    const live = liveByPlatformId.get(a.platformAccountId);
    if (live && ypfSyncService.isYpfDisabledState(live.status)) {
      await ypfSyncService.softDeleteRemovedAccount(a.id);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info({ removed }, 'YPF poll: soft-deleted disabled accounts');
  }
};

// Mirror YPF payout state (approved/rejected in the CRM) into local records.
// Isolated so a payout-sync failure never aborts the account poll.
const syncPayoutsSafe = async (): Promise<void> => {
  try {
    await payoutService.syncPayouts();
  } catch (err) {
    logger.warn({ err }, 'ypf-poller: payout sync failed');
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
    await syncPayoutsSafe();
    await writeLastPollAt(startedAt);
    return;
  }

  const provider = getTradingPlatformProvider();

  // Bulk-fetch live accounts. YPF's /tenant/accounts REQUIRES a status filter
  // (a no-arg call 400s), so sweep the relevant statuses and merge: Active +
  // Breached cover our active local accounts and just-passed (still-Active)
  // funded accounts, and Disabled feeds the removal cleanup below.
  const liveByPlatformId = new Map<string, PlatformAccountResult>();
  for (const status of POLL_STATUSES) {
    const batch = await provider.listTenantAccounts(status).catch((err) => {
      logger.warn({ err, status }, 'YPF poll: listTenantAccounts failed');
      return [] as PlatformAccountResult[];
    });
    for (const a of batch) {
      if (!liveByPlatformId.has(a.platformAccountId)) {
        liveByPlatformId.set(a.platformAccountId, a);
      }
    }
  }

  // Remove accounts that YPF has disabled (permanently removed upstream),
  // regardless of local status — including already-failed accounts that the
  // active-status poll below never revisits.
  await removeDisabledAccounts(liveByPlatformId);

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

  await syncPayoutsSafe();
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
