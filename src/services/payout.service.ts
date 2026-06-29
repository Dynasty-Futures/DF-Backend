// =============================================================================
// Payout Service
// =============================================================================
// Eligibility, profit-split math, approval, and the money rail (Rise) all live
// on YPF — we do NOT replicate those rules here (single source of truth, no
// drift). DF's job is: surface withdrawable profit, submit the request to YPF,
// and mirror the resulting state. The only local guards are cheap UX gates that
// stop obviously-invalid submissions; YPF + the CRM are the final authority.
// =============================================================================

import { AccountStatus, PayoutMethod, PayoutStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import {
  BadRequestError,
  NotFoundError,
  PlatformError,
} from '../utils/errors.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import type { PlatformAccountResult } from '../providers/types.js';
import * as payoutRepository from '../repositories/payout.repository.js';
import type { PayoutWithAccount } from '../repositories/payout.repository.js';
import {
  evaluatePayoutEligibility,
  type PayoutEligibilityInput,
  type PayoutRule,
} from './payout-eligibility.js';

// Rise is the firm's payout rail (a YPF TransferType). Bank details ride along
// in `payoutDetails` and are forwarded to YPF without being persisted locally.
const RISE_TRANSFER_TYPE = 'Rise';
const DEFAULT_CURRENCY = 'USD';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface EligibleAccountDTO {
  accountId: string;
  accountName: string;
  currency: string;
  currentBalance: number;
  startingBalance: number;
  /** Profit above the starting balance — the upper bound DF will accept. */
  availableProfit: number;
  hasPendingPayout: boolean;
  eligible: boolean;
  /** Per-rule eligibility breakdown for the UI checklist. */
  rules: PayoutRule[];
  /** Minimum a single request must be (0 = no minimum). */
  minAmount: number;
  /** Maximum a single request may be. */
  maxAmount: number;
  /** Trader's profit-split % on this account, when known. */
  profitSplit?: number | null;
  /** First blocking reason when ineligible. */
  blockingReason?: string | null;
}

export interface PayoutDTO {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  transferType: string | null;
  profitSplit: number | null;
  commission: number | null;
  transferAmount: number | null;
  rejectionReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface BankPayoutDetails {
  accountHolder: string;
  accountNumber: string;
  swiftBic: string;
  currency: string;
}

export interface RequestPayoutInput {
  userId: string;
  accountId: string;
  amount: number;
  payoutDetails: BankPayoutDetails;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const accountLabel = (a: {
  accountType: { displayName: string | null; name: string };
}): string => a.accountType.displayName || a.accountType.name;

/** YPF PayoutState ('Pending' | 'Approved' | 'Rejected') → local PayoutStatus. */
const mapYpfStateToStatus = (state: string): PayoutStatus => {
  switch (state.toLowerCase()) {
    case 'approved':
      return PayoutStatus.APPROVED;
    case 'rejected':
      return PayoutStatus.REJECTED;
    default:
      return PayoutStatus.PENDING;
  }
};

const toPayoutDTO = (p: PayoutWithAccount): PayoutDTO => ({
  id: p.id,
  accountId: p.accountId,
  accountName: accountLabel(p.account),
  amount: Number(p.amount),
  currency: p.currency,
  status: p.status,
  transferType: p.transferType,
  profitSplit: p.profitSplit === null ? null : Number(p.profitSplit),
  commission: p.commission === null ? null : Number(p.commission),
  transferAmount: p.transferAmount === null ? null : Number(p.transferAmount),
  rejectionReason: p.rejectionReason,
  requestedAt: p.requestedAt.toISOString(),
  processedAt: p.processedAt ? p.processedAt.toISOString() : null,
});

// ── Eligibility helpers ───────────────────────────────────────────────────────

/** The local-account shape the eligibility builder needs. */
interface AccountForEligibility {
  status: AccountStatus;
  currentBalance: unknown;
  startingBalance: unknown;
  platformAccountId: string | null;
  platformUserId: string | null;
  user?: { platformUserId: string | null } | null;
  /** DF plan-level payout cap + minimum (Decimals) — folded into the eligibility bounds. */
  accountType?: { payoutCycleCap: unknown; minPayoutAmount?: unknown } | null;
}

const resolvePlatformUserId = (a: AccountForEligibility): string | null =>
  a.platformUserId ?? a.user?.platformUserId ?? null;

/**
 * Pull fresh counters + withdrawal rules from YPF. Best-effort: if YPF is
 * unreachable we evaluate against stored data only (which, being fail-permissive,
 * never wrongly blocks — YPF stays the final authority at submit/approve time).
 */
const fetchLiveAccount = async (
  platformUserId: string | null,
  platformAccountId: string | null
): Promise<PlatformAccountResult | null> => {
  if (!platformUserId || !platformAccountId) return null;
  try {
    const provider = getTradingPlatformProvider();
    return await provider.getAccount(platformUserId, platformAccountId);
  } catch (err) {
    logger.warn(
      { err, platformAccountId },
      'Payout: live account fetch failed; evaluating with stored data only'
    );
    return null;
  }
};

const buildEligibilityInput = (
  account: AccountForEligibility,
  hasPendingPayout: boolean,
  live: PlatformAccountResult | null,
  requestedAmount?: number
): PayoutEligibilityInput => ({
  accountStatus: account.status,
  // Prefer the fresher live balance; fall back to the stored snapshot.
  currentBalance: live?.balance ?? Number(account.currentBalance),
  startingBalance: Number(account.startingBalance),
  hasPendingPayout,
  isPlatformLinked:
    account.platformAccountId !== null && resolvePlatformUserId(account) !== null,
  profitTradingDays: live?.profitTradingDays,
  activeDays: live?.activeDays,
  tradingDays: live?.tradingDays,
  profitSplit: live?.profitSplit,
  planPayoutCap:
    account.accountType?.payoutCycleCap != null
      ? Number(account.accountType.payoutCycleCap)
      : undefined,
  planMinPayout:
    account.accountType?.minPayoutAmount != null
      ? Number(account.accountType.minPayoutAmount)
      : undefined,
  rules: live?.withdrawalRules,
  ...(requestedAmount !== undefined ? { requestedAmount } : {}),
});

// ── Eligible accounts ──────────────────────────────────────────────────────

/**
 * Funded accounts with their withdrawable profit and a full per-rule eligibility
 * breakdown. We pull live counters + withdrawal rules from YPF per account and
 * run the (fail-permissive) eligibility engine so the UI can show exactly what's
 * met / unmet. YPF still enforces the rules at request and approval time.
 */
export const getEligibleAccounts = async (
  userId: string
): Promise<EligibleAccountDTO[]> => {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      deletedAt: null,
      status: AccountStatus.FUNDED,
    },
    include: { accountType: true, user: { select: { platformUserId: true } } },
  });

  const result: EligibleAccountDTO[] = [];
  for (const a of accounts) {
    const active = await payoutRepository.findActivePayoutForAccount(a.id);
    const hasPendingPayout = active !== null;
    const live = await fetchLiveAccount(
      resolvePlatformUserId(a),
      a.platformAccountId
    );

    const evalResult = evaluatePayoutEligibility(
      buildEligibilityInput(a, hasPendingPayout, live)
    );

    result.push({
      accountId: a.id,
      accountName: accountLabel(a),
      currency: DEFAULT_CURRENCY,
      currentBalance: live?.balance ?? Number(a.currentBalance),
      startingBalance: Number(a.startingBalance),
      availableProfit: evalResult.availableProfit,
      hasPendingPayout,
      eligible: evalResult.eligible,
      rules: evalResult.rules,
      minAmount: evalResult.minAmount,
      maxAmount: evalResult.maxAmount,
      profitSplit: live?.profitSplit ?? null,
      blockingReason: evalResult.blockingReason ?? null,
    });
  }

  return result;
};

// ── Request a payout ─────────────────────────────────────────────────────────

export const requestPayout = async (
  input: RequestPayoutInput
): Promise<PayoutDTO> => {
  const { userId, accountId, amount, payoutDetails } = input;

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    include: { accountType: true, user: true },
  });

  if (!account) {
    throw new NotFoundError('Account not found');
  }

  const platformUserId = account.platformUserId ?? account.user.platformUserId;
  const platformAccountId = account.platformAccountId;
  if (!platformUserId || !platformAccountId) {
    throw new PlatformError(
      'This account is not linked to the trading platform yet',
      {},
      400
    );
  }

  // Full eligibility check against the live account (counters + withdrawal
  // rules). Fail-permissive on missing YPF config, but blocks anything we can
  // prove ineligible before it ever hits YPF.
  const active = await payoutRepository.findActivePayoutForAccount(accountId);
  const live = await fetchLiveAccount(platformUserId, platformAccountId);
  const eligibility = evaluatePayoutEligibility(
    buildEligibilityInput(account, active !== null, live, amount)
  );
  if (!eligibility.eligible || eligibility.amountErrors.length > 0) {
    throw new BadRequestError(
      eligibility.blockingReason ??
        'This account is not eligible for a payout right now'
    );
  }

  // Submit to YPF. Bank details are forwarded but never stored locally.
  let platform;
  try {
    const provider = getTradingPlatformProvider();
    platform = await provider.createPayout(platformUserId, {
      platformAccountId,
      amount,
      currency: DEFAULT_CURRENCY,
      method: RISE_TRANSFER_TYPE,
      payoutDetails: { ...payoutDetails },
    });
  } catch (err) {
    logger.error(
      { err, userId, accountId, amount },
      'Failed to create payout on YPF'
    );
    throw new PlatformError('Could not submit payout request. Please try again later.');
  }

  const payout = await payoutRepository.createPayout({
    accountId,
    amount,
    currency: DEFAULT_CURRENCY,
    method: PayoutMethod.RISE,
    transferType: RISE_TRANSFER_TYPE,
    platformPayoutId: platform.platformPayoutId,
    profitSplit: platform.profitSplit,
    commission: platform.commission,
    transferAmount: platform.transferAmount,
  });

  logger.info(
    { userId, accountId, payoutId: payout.id, platformPayoutId: platform.platformPayoutId, amount },
    'Payout request submitted to YPF'
  );

  // Re-read with account relation so the DTO carries the account label.
  const withAccount = await payoutRepository.findPayoutByIdForUser(
    payout.id,
    userId
  );
  return toPayoutDTO(withAccount ?? (payout as unknown as PayoutWithAccount));
};

// ── History ──────────────────────────────────────────────────────────────────

export const getPayoutHistory = async (
  userId: string
): Promise<PayoutDTO[]> => {
  const payouts = await payoutRepository.findPayoutsByUserId(userId);
  return payouts.map(toPayoutDTO);
};

export const getPayoutById = async (
  userId: string,
  id: string
): Promise<PayoutDTO> => {
  const payout = await payoutRepository.findPayoutByIdForUser(id, userId);
  if (!payout) {
    throw new NotFoundError('Payout not found');
  }
  return toPayoutDTO(payout);
};

// ── Poller reconciliation ─────────────────────────────────────────────────────

/**
 * Pull current payout state from YPF and mirror status transitions locally.
 * Invoked by the YPF poller — approvals/rejections happen in YPF's CRM, so this
 * is how those decisions surface back to the trader.
 */
export const syncPayouts = async (): Promise<number> => {
  const reconcilable = await payoutRepository.findReconcilablePayouts();
  if (reconcilable.length === 0) return 0;

  const provider = getTradingPlatformProvider();
  const platformPayouts = await provider.listPayouts();
  const byId = new Map(platformPayouts.map((p) => [p.platformPayoutId, p]));

  let updated = 0;
  for (const local of reconcilable) {
    if (!local.platformPayoutId) continue;
    const remote = byId.get(local.platformPayoutId);
    if (!remote) continue;

    const status = mapYpfStateToStatus(remote.status);
    if (status === local.status) continue;

    await payoutRepository.updatePayoutFromPlatform(local.id, {
      status,
      rejectionReason: remote.rejectionReason,
      profitSplit: remote.profitSplit,
      commission: remote.commission,
      transferAmount: remote.transferAmount,
    });
    updated++;
  }

  if (updated > 0) {
    logger.info({ updated }, 'YPF payout sync: statuses updated');
  }
  return updated;
};
