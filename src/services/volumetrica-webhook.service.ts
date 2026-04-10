import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { failChallenge, advanceChallenge } from './challenge-transition.service.js';
import { ViolationType } from '@prisma/client';

// =============================================================================
// Volumetrica Webhook Service
// =============================================================================
// Handles incoming webhook events from the Volumetrica trading platform.
// Primary events: account status changes triggered by trading rule enforcement.
// =============================================================================

// ── Volumetrica Webhook Payload Types ───────────────────────────────────────

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

interface WebhookTradingAccount {
  id: string;
  status: number;
  reason?: string | undefined;
}

interface WebhookPayload {
  dtUtc: string;
  category: number;
  event: number;
  tradingAccount: WebhookTradingAccount;
}

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * Processes a Volumetrica webhook event.
 * Currently handles account status updates (category=0, event=1).
 */
export const handleWebhookEvent = async (payload: WebhookPayload): Promise<void> => {
  const { category, event, tradingAccount } = payload;

  logger.info(
    { category, event, platformAccountId: tradingAccount.id, status: tradingAccount.status },
    'Processing Volumetrica webhook event',
  );

  // Only handle account update events
  if (category !== WEBHOOK_CATEGORY.ACCOUNTS || event !== WEBHOOK_EVENT.UPDATED) {
    logger.debug(
      { category, event },
      'Ignoring non-account-update webhook event',
    );
    return;
  }

  // Look up local account by platform ID
  const account = await prisma.account.findFirst({
    where: { yourPropFirmId: tradingAccount.id },
  });

  if (!account) {
    logger.warn(
      { platformAccountId: tradingAccount.id },
      'Webhook received for unknown platform account — ignoring',
    );
    return;
  }

  switch (tradingAccount.status) {
    case ACCOUNT_STATUS.CHALLENGE_FAILED:
      await failChallenge(
        account.id,
        tradingAccount.reason ?? 'Rule violation detected by platform',
        ViolationType.OTHER,
      );
      break;

    case ACCOUNT_STATUS.CHALLENGE_SUCCESS:
      await advanceChallenge(account.id);
      break;

    case ACCOUNT_STATUS.DISABLED:
      await failChallenge(
        account.id,
        tradingAccount.reason ?? 'Account disabled by platform',
        ViolationType.OTHER,
      );
      break;

    default:
      logger.debug(
        { status: tradingAccount.status, accountId: account.id },
        'Webhook status not actionable — skipping',
      );
  }
};
