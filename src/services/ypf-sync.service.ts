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

// A reactivated account comes back as Active upstream. Used by the poller to
// detect a locally-failed account that YPF has un-breached.
const YPF_ACTIVE = ['Active', 'active'];

/** Whether a YPF account state means the account is live/active. */
export const isYpfActiveState = (state: string): boolean =>
  YPF_ACTIVE.includes(state);

// YPF has no "account passed" event and never emits a Funded/Upgraded *state* —
// an account that passes evaluation is simply moved onto the funded program
// (its programId changes to a terminal program with no `nextProgramId`). So we
// detect the eval→funded transition by checking whether the account's live
// programId is a terminal/funded program. The funded-program set is cached
// because the catalog changes rarely and we'd otherwise refetch it per account.
let fundedProgramCache: { at: number; ids: Set<string> } | null = null;
const FUNDED_PROGRAM_CACHE_TTL_MS = 5 * 60 * 1000;

const loadFundedProgramIds = async (
  provider: ReturnType<typeof getTradingPlatformProvider>,
): Promise<Set<string>> => {
  const now = Date.now();
  if (fundedProgramCache && now - fundedProgramCache.at < FUNDED_PROGRAM_CACHE_TTL_MS) {
    return fundedProgramCache.ids;
  }
  const programs = await provider.listPrograms();
  // A program with no successor is the funded/terminal phase. YPF returns
  // `nextProgramId: null` (not undefined), so use a truthy check.
  const ids = new Set(
    programs.filter((p) => !p.nextProgramId).map((p) => p.programId),
  );
  fundedProgramCache = { at: now, ids };
  return ids;
};

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
  AccountStatus.UPGRADED,
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

  // YPF's upgrade model: passing the evaluation does NOT fund the account in
  // place. YPF spawns a NEW account on the funded program and marks THIS one
  // `Upgraded`. The new funded account is discovered separately, so the retired
  // `Upgraded` account is CLOSED locally (→ inactive section) — advancing it to
  // FUNDED would double-count the funded account.
  const isSuperseded = YPF_UPGRADED.includes(upstreamState);

  // Safety net for an in-place funding flip: the account's OWN program became
  // terminal/funded while we still hold it as non-funded. (Not how YPF behaves
  // today — it spawns a new account — but keep it so a future in-place flip, or
  // a row created while the funded program was mis-detected, still advances.)
  const fundedProgramIds = await loadFundedProgramIds(provider).catch(
    () => new Set<string>(),
  );
  const liveProgramIsFunded =
    !!live.programId && fundedProgramIds.has(live.programId);
  const isInPlaceFunded =
    account.status !== AccountStatus.FUNDED &&
    (liveProgramIsFunded || YPF_FUNDED.includes(upstreamState));

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

  // Check superseded BEFORE in-place funding: an `Upgraded` account is always
  // retired in favour of a freshly-spawned funded account, whatever its program.
  if (isSuperseded) {
    await challengeTransitionService.closeUpgradedAccount(localAccountId);
    return;
  }

  if (isInPlaceFunded) {
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
