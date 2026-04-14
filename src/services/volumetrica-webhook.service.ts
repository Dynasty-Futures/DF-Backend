import { ChallengeStatus, ViolationSeverity, ViolationType } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { failChallenge, advanceChallenge } from './challenge-transition.service.js';

// =============================================================================
// Volumetrica Webhook Service
// =============================================================================
// Handles incoming webhook events from the Volumetrica trading platform.
// Primary events: account status changes triggered by trading rule enforcement.
//
// Two-phase processing:
// 1. Critical path — status transitions (failChallenge, advanceChallenge)
// 2. Non-critical path — balance sync, challenge progress, permission changes
// =============================================================================

// ── Volumetrica Webhook Enums ──────────────────────────────────────────────

/** Volumetrica TradingAccountStatusEnum */
const ACCOUNT_STATUS = {
  INITIALIZED: 0,
  ENABLED: 1,
  CHALLENGE_SUCCESS: 2,
  CHALLENGE_FAILED: 4,
  DISABLED: 8,
} as const;

/** Volumetrica WebhookCategoryEnum */
const WEBHOOK_CATEGORY = {
  ACCOUNTS: 0,
} as const;

/** Volumetrica WebhookEventEnum */
const WEBHOOK_EVENT = {
  UPDATED: 1,
} as const;

/** Volumetrica TradingAccountPermissionEnum */
const TRADING_PERMISSION = {
  TRADING: 0,
  READ_ONLY: 1,
  RISK_PAUSE: 2,
  LIQUIDATE_ONLY: 3,
} as const;

// ── Volumetrica Webhook Payload Types ───────────────────────────────────────

interface WebhookAccountSnapshot {
  balance: number;
  startBalance: number;
  maximumBalance: number;
  minimumBalance: number;
  dailyPL: number;
  sessionNumbers: number;
}

interface WebhookTradingAccount {
  id: string;
  status: number;
  tradingPermission: number;
  reason?: string | undefined;
  snapshot?: WebhookAccountSnapshot | undefined;
}

interface WebhookPayload {
  dtUtc: string;
  category: number;
  event: number;
  tradingAccount: WebhookTradingAccount;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Best-effort keyword match of a Volumetrica reason string to a ViolationType.
 * Defaults to OTHER when no keywords match.
 */
export const parseViolationType = (reason: string): ViolationType => {
  const lower = reason.toLowerCase();
  if (lower.includes('daily') || lower.includes('intraday')) return ViolationType.DAILY_LOSS_LIMIT;
  if (lower.includes('drawdown') || lower.includes('max loss')) return ViolationType.MAX_DRAWDOWN;
  if (lower.includes('news')) return ViolationType.NEWS_TRADING;
  if (lower.includes('weekend') || lower.includes('overnight')) return ViolationType.WEEKEND_HOLDING;
  if (lower.includes('position') || lower.includes('contract')) return ViolationType.POSITION_SIZE;
  if (lower.includes('consistency')) return ViolationType.CONSISTENCY_RULE;
  if (lower.includes('trading day') || lower.includes('minimum day')) return ViolationType.MINIMUM_TRADING_DAYS;
  return ViolationType.OTHER;
};

/**
 * Updates Account financial fields from a webhook snapshot.
 * maxDrawdownHit is only updated if the new value is worse (higher).
 */
const syncBalanceFromWebhook = async (
  accountId: string,
  snapshot: WebhookAccountSnapshot,
  currentMaxDrawdownHit: number,
): Promise<void> => {
  const totalPnl = snapshot.balance - snapshot.startBalance;
  const currentDrawdown =
    snapshot.startBalance > 0
      ? ((snapshot.maximumBalance - snapshot.balance) / snapshot.startBalance) * 100
      : 0;
  const maxDrawdownValue =
    snapshot.startBalance > 0
      ? ((snapshot.maximumBalance - snapshot.minimumBalance) / snapshot.startBalance) * 100
      : 0;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      currentBalance: snapshot.balance,
      highWaterMark: snapshot.maximumBalance,
      dailyPnl: snapshot.dailyPL,
      totalPnl: totalPnl,
      currentDrawdown: currentDrawdown,
      maxDrawdownHit: Math.max(currentMaxDrawdownHit, maxDrawdownValue),
      tradingDays: snapshot.sessionNumbers,
      updatedAt: new Date(),
    },
  });

  logger.debug(
    { accountId, balance: snapshot.balance, totalPnl, currentDrawdown },
    'Synced balance from webhook',
  );
};

/**
 * Updates the active Challenge with profit percentage and trading day count.
 * Uses updateMany so it silently no-ops if no active challenge exists.
 */
const updateChallengeProgress = async (
  accountId: string,
  snapshot: WebhookAccountSnapshot,
): Promise<void> => {
  const currentProfit =
    snapshot.startBalance > 0
      ? ((snapshot.balance - snapshot.startBalance) / snapshot.startBalance) * 100
      : 0;

  const result = await prisma.challenge.updateMany({
    where: { accountId, status: ChallengeStatus.ACTIVE },
    data: {
      currentProfit: currentProfit,
      tradingDaysCount: snapshot.sessionNumbers,
    },
  });

  if (result.count > 0) {
    logger.debug({ accountId, currentProfit, tradingDays: snapshot.sessionNumbers }, 'Updated challenge progress');
  }
};

/**
 * When the platform restricts trading permission to RiskPause or LiquidateOnly,
 * records a WARNING-severity RuleViolation for admin visibility.
 */
const handleTradingPermissionChange = async (
  accountId: string,
  permission: number,
  reason: string | undefined,
): Promise<void> => {
  if (
    permission !== TRADING_PERMISSION.RISK_PAUSE &&
    permission !== TRADING_PERMISSION.LIQUIDATE_ONLY
  ) {
    return;
  }

  const permName = permission === TRADING_PERMISSION.RISK_PAUSE ? 'RiskPause' : 'LiquidateOnly';
  const description = reason ?? `Trading permission changed to ${permName} by platform`;

  await prisma.ruleViolation.create({
    data: {
      accountId,
      type: parseViolationType(description),
      severity: ViolationSeverity.WARNING,
      description,
      causedFailure: false,
    },
  });

  logger.warn({ accountId, permission: permName, reason }, 'Trading permission restricted by platform');
};

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * Processes a Volumetrica webhook event.
 *
 * Phase 1 (critical): Status transitions — errors bubble up.
 * Phase 2 (non-critical): Balance sync, challenge progress, permission changes — errors are logged.
 */
export const handleWebhookEvent = async (payload: WebhookPayload): Promise<void> => {
  const { category, event, tradingAccount } = payload;

  logger.info(
    {
      category,
      event,
      platformAccountId: tradingAccount.id,
      status: tradingAccount.status,
      tradingPermission: tradingAccount.tradingPermission,
      hasSnapshot: !!tradingAccount.snapshot,
    },
    'Processing Volumetrica webhook event',
  );

  // Only handle account update events
  if (category !== WEBHOOK_CATEGORY.ACCOUNTS || event !== WEBHOOK_EVENT.UPDATED) {
    logger.debug({ category, event }, 'Ignoring non-account-update webhook event');
    return;
  }

  // Look up local account by platform ID, including active challenge
  const account = await prisma.account.findFirst({
    where: { yourPropFirmId: tradingAccount.id },
    include: {
      challenges: {
        where: { status: ChallengeStatus.ACTIVE },
        take: 1,
      },
    },
  });

  if (!account) {
    logger.warn(
      { platformAccountId: tradingAccount.id },
      'Webhook received for unknown platform account — ignoring',
    );
    return;
  }

  const reason = tradingAccount.reason ?? 'Rule violation detected by platform';

  // Phase 1: Critical path — status transitions
  switch (tradingAccount.status) {
    case ACCOUNT_STATUS.CHALLENGE_FAILED:
      await failChallenge(account.id, reason, parseViolationType(reason));
      break;

    case ACCOUNT_STATUS.CHALLENGE_SUCCESS:
      await advanceChallenge(account.id);
      break;

    case ACCOUNT_STATUS.DISABLED:
      await failChallenge(
        account.id,
        tradingAccount.reason ?? 'Account disabled by platform',
        parseViolationType(tradingAccount.reason ?? 'Account disabled by platform'),
      );
      break;

    default:
      logger.debug(
        { status: tradingAccount.status, accountId: account.id },
        'Webhook status not actionable — skipping',
      );
  }

  // Phase 2: Non-critical sync — errors logged, not thrown
  try {
    if (tradingAccount.snapshot) {
      await syncBalanceFromWebhook(
        account.id,
        tradingAccount.snapshot,
        Number(account.maxDrawdownHit),
      );

      if (account.challenges[0]) {
        await updateChallengeProgress(account.id, tradingAccount.snapshot);
      }
    }

    if (tradingAccount.tradingPermission !== undefined) {
      await handleTradingPermissionChange(
        account.id,
        tradingAccount.tradingPermission,
        tradingAccount.reason,
      );
    }
  } catch (err) {
    logger.error({ err, accountId: account.id }, 'Non-critical webhook sync failed');
  }
};
