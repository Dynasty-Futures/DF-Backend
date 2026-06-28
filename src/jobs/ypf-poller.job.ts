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
import * as challengeTransitionService from '../services/challenge-transition.service.js';
import * as payoutService from '../services/payout.service.js';
import type { PlatformAccountResult } from '../providers/types.js';

const LAST_POLL_KEY = 'ypf:poller:lastPollAt';

const ACTIVE_STATUSES: AccountStatus[] = [
  AccountStatus.EVALUATION,
  AccountStatus.PHASE_2,
  AccountStatus.PASSED,
  AccountStatus.FUNDED,
];

// Every YPF AccountState value. /tenant/accounts requires a status filter (a
// no-arg call 400s), so we sweep them all and merge. We need the COMPLETE set,
// not just Active/Breached/Disabled, for two reasons:
//   1. Active + Breached reconcile our live accounts (incl. just-passed funded
//      accounts, still reported Active).
//   2. The removal cleanup treats "absent from every status list" as removed
//      upstream — so we must query every state an account could legitimately be
//      in (Inactive/Pending/Upgraded) or we'd wrongly delete those.
// NB: YPF drops permanently-removed accounts from ALL lists (the Disabled list
// comes back empty), so absence — not a "Disabled" flag — is the real signal.
const POLL_STATUSES = [
  'Active',
  'Breached',
  'Disabled',
  'Inactive',
  'Pending',
  'Upgraded',
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

// Soft-delete local accounts that YPF has removed upstream — either explicitly
// `Disabled`, or absent from EVERY status list (YPF drops removed accounts
// entirely; the Disabled list comes back empty). Covers ALL local accounts in
// one pass — active and already-failed alike.
//
// `sweepComplete` = every status query in the bulk fetch succeeded. We only act
// on absence when the snapshot is trustworthy (sweep complete AND it returned
// at least one account), so a transient YPF outage can't wipe healthy accounts.
export const reconcileRemovedAccounts = async (
  localAccounts: { id: string; platformAccountId: string | null }[],
  liveByPlatformId: Map<string, PlatformAccountResult>,
  sweepComplete: boolean,
): Promise<void> => {
  const canTrustAbsence = sweepComplete && liveByPlatformId.size > 0;

  let removed = 0;
  for (const a of localAccounts) {
    if (!a.platformAccountId) continue;
    const live = liveByPlatformId.get(a.platformAccountId);
    const explicitlyDisabled =
      live !== undefined && ypfSyncService.isYpfDisabledState(live.status);
    const removedUpstream = live === undefined && canTrustAbsence;
    if (explicitlyDisabled || removedUpstream) {
      await ypfSyncService.softDeleteRemovedAccount(a.id);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(
      { removed },
      'YPF poll: soft-deleted accounts removed upstream',
    );
  }
};

// Reactivate locally-failed accounts that YPF now reports as Active again —
// staff reactivated a breached account on the CRM (AccountBreachedReactivated).
// Uses the already-fetched live snapshot, so no extra API calls. Once restored,
// the next poll picks the account up as active and resumes normal sync.
export const reconcileReactivatedAccounts = async (
  localAccounts: { id: string; status: AccountStatus; platformAccountId: string | null }[],
  liveByPlatformId: Map<string, PlatformAccountResult>,
): Promise<void> => {
  let reactivated = 0;
  for (const a of localAccounts) {
    if (a.status !== AccountStatus.FAILED || !a.platformAccountId) continue;
    const live = liveByPlatformId.get(a.platformAccountId);
    if (live && ypfSyncService.isYpfActiveState(live.status)) {
      await challengeTransitionService.reactivateChallenge(a.id);
      reactivated++;
    }
  }

  if (reactivated > 0) {
    logger.info({ reactivated }, 'YPF poll: reactivated accounts restored upstream');
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

  // ALL non-deleted local accounts (not just active) — the removal reconcile
  // below must see failed/closed rows too, since a user whose accounts are all
  // breached has zero "active" accounts but can still accumulate stale rows.
  const localAccounts = await prisma.account.findMany({
    where: {
      deletedAt: null,
      platformAccountId: { not: null },
    },
    select: {
      id: true,
      status: true,
      platformAccountId: true,
      platformUserId: true,
    },
  });

  if (localAccounts.length === 0) {
    logger.debug('YPF poll: no local accounts to reconcile');
    await syncPayoutsSafe();
    await writeLastPollAt(startedAt);
    return;
  }

  const provider = getTradingPlatformProvider();

  // Bulk-fetch live accounts across EVERY YPF status (a no-arg /tenant/accounts
  // 400s). Track whether every query succeeded — the removal reconcile only
  // trusts "absent" when the sweep was complete, so an API blip can't mass-wipe.
  const liveByPlatformId = new Map<string, PlatformAccountResult>();
  let sweepComplete = true;
  for (const status of POLL_STATUSES) {
    try {
      const batch = await provider.listTenantAccounts(status);
      for (const a of batch) {
        if (!liveByPlatformId.has(a.platformAccountId)) {
          liveByPlatformId.set(a.platformAccountId, a);
        }
      }
    } catch (err) {
      sweepComplete = false;
      logger.warn({ err, status }, 'YPF poll: listTenantAccounts failed');
    }
  }

  // Soft-delete accounts YPF removed (Disabled or absent from every list) —
  // runs for ALL local accounts, including ones with no active rows to poll.
  await reconcileRemovedAccounts(localAccounts, liveByPlatformId, sweepComplete);

  // Restore locally-failed accounts that YPF has reactivated. Runs after the
  // removal pass (a reactivated account is present + Active, so it's never
  // soft-deleted here).
  await reconcileReactivatedAccounts(localAccounts, liveByPlatformId);

  // Per-account breach/transition sync only applies to still-active accounts.
  const activeAccounts = localAccounts.filter(
    (a) => ACTIVE_STATUSES.includes(a.status) && a.platformUserId !== null,
  );

  let processed = 0;
  if (activeAccounts.length > 0) {
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
  }

  await syncPayoutsSafe();
  await writeLastPollAt(startedAt);

  logger.info(
    {
      processed,
      activeTotal: activeAccounts.length,
      localTotal: localAccounts.length,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'YPF poll: complete',
  );
};
