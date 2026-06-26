// =============================================================================
// YPF Sync Service
// =============================================================================
// Replaces the old webhook-driven Volumetrica handler. Since YPF has no
// webhooks, this is invoked by the YPF poller (src/jobs/ypf-poller.job.ts)
// for each account whose YPF state may have changed.
//
// Reconciles platform state into our local DB and fires challenge transitions
// when YPF reports a Breached or Upgraded state.
// =============================================================================

import { AccountStatus, ViolationType } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import * as syncService from './sync.service.js';
import * as challengeTransitionService from './challenge-transition.service.js';
import type {
  PlatformAccountResult,
  PlatformBreachResult,
} from '../providers/types.js';

// YPF AccountState values that imply our local-side transitions.
const YPF_BREACHED = ['Breached', 'breached'];
const YPF_UPGRADED = ['Upgraded', 'upgraded'];
const YPF_FUNDED = ['Funded', 'funded'];
// "Disabled" means the account was permanently removed on YPF (e.g. lapsed/
// cancelled). We mirror that by soft-deleting locally so it drops off the
// dashboard entirely — only active/inactive (breached) accounts should show.
const YPF_DISABLED = ['Disabled', 'disabled'];

/** Whether a YPF account state means the account was removed upstream. */
export const isYpfDisabledState = (state: string): boolean =>
  YPF_DISABLED.includes(state);

/** Soft-delete a local account that no longer exists on YPF (idempotent). */
export const softDeleteRemovedAccount = async (
  localAccountId: string,
): Promise<void> => {
  await prisma.account.update({
    where: { id: localAccountId },
    data: { deletedAt: new Date(), status: AccountStatus.CLOSED },
  });
};

// Local statuses that should never be overwritten by a YPF poll.
const TERMINAL_STATUSES = new Set<AccountStatus>([
  AccountStatus.FAILED,
  AccountStatus.CLOSED,
]);

interface SyncInput {
  localAccountId: string;
  /** Pre-fetched live state from YPF; if absent we fetch ourselves. */
  liveAccount?: PlatformAccountResult;
  /** Pre-fetched breaches keyed by accountId; if absent we fetch ourselves. */
  liveBreaches?: PlatformBreachResult[];
}

/**
 * Reconcile a single account from YPF into our DB. Idempotent — safe to call
 * repeatedly from the poller.
 */
export const syncAccountFromYPF = async ({
  localAccountId,
  liveAccount,
  liveBreaches,
}: SyncInput): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { id: localAccountId },
    select: {
      id: true,
      status: true,
      platformAccountId: true,
      platformUserId: true,
    },
  });

  if (!account) {
    logger.warn({ localAccountId }, 'syncAccountFromYPF: account not found');
    return;
  }
  if (!account.platformAccountId || !account.platformUserId) {
    logger.debug(
      { localAccountId },
      'syncAccountFromYPF: account not linked to YPF — skipping',
    );
    return;
  }
  if (TERMINAL_STATUSES.has(account.status)) {
    logger.debug(
      { localAccountId, status: account.status },
      'syncAccountFromYPF: terminal status — skipping',
    );
    return;
  }

  const provider = getTradingPlatformProvider();

  let live: PlatformAccountResult;
  try {
    live =
      liveAccount ??
      (await provider.getAccount(
        account.platformUserId,
        account.platformAccountId,
      ));
  } catch (err) {
    logger.warn(
      { err, localAccountId, platformAccountId: account.platformAccountId },
      'syncAccountFromYPF: failed to fetch live account',
    );
    return;
  }

  const upstreamState = live.status;

  // Disabled on YPF = permanently removed. Soft-delete and stop — no point
  // syncing balance or running transitions on an account that no longer exists
  // upstream. Once deletedAt is set it drops out of the poller query and the
  // dashboard (both filter deletedAt: null).
  if (isYpfDisabledState(upstreamState)) {
    await softDeleteRemovedAccount(localAccountId);
    logger.info(
      { localAccountId, platformAccountId: account.platformAccountId },
      'syncAccountFromYPF: YPF account disabled — soft-deleted locally',
    );
    return;
  }

  // Persist balance / metadata first so transition logic sees fresh DB state.
  await syncService.syncAccountFromPlatform(localAccountId, live);

  const isBreached = YPF_BREACHED.includes(upstreamState);
  const isUpgrade =
    YPF_UPGRADED.includes(upstreamState) ||
    (YPF_FUNDED.includes(upstreamState) &&
      account.status !== AccountStatus.FUNDED);

  if (isBreached) {
    const breaches =
      liveBreaches ??
      (await provider
        .getAccountBreaches(account.platformUserId, account.platformAccountId)
        .catch(() => [] as PlatformBreachResult[]));
    const lastBreach = breaches[breaches.length - 1];
    const reason = lastBreach?.reason ?? `YPF reported state ${upstreamState}`;
    await challengeTransitionService.failChallenge(
      localAccountId,
      reason,
      mapBreachToViolationType(lastBreach?.ruleName),
    );
    return;
  }

  if (isUpgrade) {
    await challengeTransitionService.advanceChallenge(localAccountId);
    return;
  }
};

const mapBreachToViolationType = (ruleName?: string): ViolationType => {
  if (!ruleName) return ViolationType.OTHER;
  const n = ruleName.toLowerCase();
  if (n.includes('daily')) return ViolationType.DAILY_LOSS_LIMIT;
  if (n.includes('drawdown') || n.includes('maxloss')) return ViolationType.MAX_DRAWDOWN;
  if (n.includes('news')) return ViolationType.NEWS_TRADING;
  if (n.includes('weekend')) return ViolationType.WEEKEND_HOLDING;
  if (n.includes('consistency')) return ViolationType.CONSISTENCY_RULE;
  if (n.includes('position')) return ViolationType.POSITION_SIZE;
  if (n.includes('trading') && n.includes('day')) return ViolationType.MINIMUM_TRADING_DAYS;
  return ViolationType.OTHER;
};
