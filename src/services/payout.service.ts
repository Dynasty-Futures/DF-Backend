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
import * as payoutRepository from '../repositories/payout.repository.js';
import type { PayoutWithAccount } from '../repositories/payout.repository.js';

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

// ── Eligible accounts ──────────────────────────────────────────────────────

/**
 * Funded accounts with their withdrawable profit. `eligible` is a soft UX hint
 * (funded + has profit + nothing in flight + linked to the platform). YPF still
 * enforces the real winning-day / cap rules at request and approval time.
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
    include: { accountType: true },
  });

  const result: EligibleAccountDTO[] = [];
  for (const a of accounts) {
    const currentBalance = Number(a.currentBalance);
    const startingBalance = Number(a.startingBalance);
    const availableProfit = Math.max(0, currentBalance - startingBalance);
    const active = await payoutRepository.findActivePayoutForAccount(a.id);
    const hasPendingPayout = active !== null;

    result.push({
      accountId: a.id,
      accountName: accountLabel(a),
      currency: DEFAULT_CURRENCY,
      currentBalance,
      startingBalance,
      availableProfit,
      hasPendingPayout,
      eligible:
        availableProfit > 0 && !hasPendingPayout && a.platformAccountId !== null,
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

  if (account.status !== AccountStatus.FUNDED) {
    throw new BadRequestError(
      'Only funded accounts are eligible for payouts'
    );
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

  const availableProfit = Math.max(
    0,
    Number(account.currentBalance) - Number(account.startingBalance)
  );
  if (amount <= 0) {
    throw new BadRequestError('Payout amount must be greater than zero');
  }
  if (amount > availableProfit) {
    throw new BadRequestError(
      'Requested amount exceeds your withdrawable profit'
    );
  }

  const active = await payoutRepository.findActivePayoutForAccount(accountId);
  if (active) {
    throw new BadRequestError(
      'You already have a payout request in progress for this account'
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
