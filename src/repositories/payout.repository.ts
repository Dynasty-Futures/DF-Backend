import { Payout, PayoutMethod, PayoutStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/database.js';

// =============================================================================
// Payout Repository
// =============================================================================
// The payout request itself lives on YPF (created + approved/rejected in their
// CRM). We persist a mirror row so the trader can see history without a live
// call, and the YPF poller reconciles state changes back into it.
// =============================================================================

export interface CreatePayoutData {
  accountId: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  transferType: string;
  platformPayoutId?: string | undefined;
  profitSplit?: number | undefined;
  commission?: number | undefined;
  transferAmount?: number | undefined;
}

const payoutWithAccount = {
  account: {
    include: { accountType: true },
  },
} satisfies Prisma.PayoutInclude;

export type PayoutWithAccount = Prisma.PayoutGetPayload<{
  include: typeof payoutWithAccount;
}>;

export const createPayout = async (data: CreatePayoutData): Promise<Payout> => {
  return prisma.payout.create({
    data: {
      accountId: data.accountId,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      transferType: data.transferType,
      status: PayoutStatus.PENDING,
      ...(data.platformPayoutId && { platformPayoutId: data.platformPayoutId }),
      ...(data.profitSplit !== undefined && { profitSplit: data.profitSplit }),
      ...(data.commission !== undefined && { commission: data.commission }),
      ...(data.transferAmount !== undefined && {
        transferAmount: data.transferAmount,
      }),
    },
  });
};

/** All payouts for a user (across their accounts), newest first. */
export const findPayoutsByUserId = async (
  userId: string
): Promise<PayoutWithAccount[]> => {
  return prisma.payout.findMany({
    where: { account: { userId } },
    include: payoutWithAccount,
    orderBy: { requestedAt: 'desc' },
  });
};

/** A single payout scoped to its owning user (404-safe lookup). */
export const findPayoutByIdForUser = async (
  id: string,
  userId: string
): Promise<PayoutWithAccount | null> => {
  return prisma.payout.findFirst({
    where: { id, account: { userId } },
    include: payoutWithAccount,
  });
};

/** Used to block a second concurrent request while one is still processing. */
export const findActivePayoutForAccount = async (
  accountId: string
): Promise<Payout | null> => {
  return prisma.payout.findFirst({
    where: {
      accountId,
      status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
    },
  });
};

/**
 * Non-terminal payouts that carry a YPF id — the poller refreshes these.
 * Approved/Rejected happens in the YPF CRM, so PENDING/PROCESSING rows are
 * the ones whose state can still change upstream.
 */
export const findReconcilablePayouts = async (): Promise<Payout[]> => {
  return prisma.payout.findMany({
    where: {
      platformPayoutId: { not: null },
      status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
    },
  });
};

export interface UpdatePayoutFromPlatformData {
  status: PayoutStatus;
  rejectionReason?: string | undefined;
  profitSplit?: number | undefined;
  commission?: number | undefined;
  transferAmount?: number | undefined;
}

export const updatePayoutFromPlatform = async (
  id: string,
  data: UpdatePayoutFromPlatformData
): Promise<Payout> => {
  const now = new Date();
  return prisma.payout.update({
    where: { id },
    data: {
      status: data.status,
      ...(data.rejectionReason && { rejectionReason: data.rejectionReason }),
      ...(data.profitSplit !== undefined && { profitSplit: data.profitSplit }),
      ...(data.commission !== undefined && { commission: data.commission }),
      ...(data.transferAmount !== undefined && {
        transferAmount: data.transferAmount,
      }),
      ...(data.status === PayoutStatus.COMPLETED && { processedAt: now }),
      ...(data.status === PayoutStatus.REJECTED && { reviewedAt: now }),
      ...(data.status === PayoutStatus.FAILED && { failedAt: now }),
    },
  });
};
