// =============================================================================
// Trading Service — Hybrid Live/Stored Strategy
// =============================================================================
// Each function documents whether data is LIVE (pass-through to provider) or
// STORED (read from Prisma). Some endpoints support a forced refresh via the
// `live` flag, which triggers a provider call + DB update before responding.
// =============================================================================

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ForbiddenError, PlatformError } from '../utils/errors.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import * as syncService from './sync.service.js';

import type { PlatformReportResult } from '../providers/types.js';

// =============================================================================
// Helpers
// =============================================================================

const requirePlatformAccountId = (account: { yourPropFirmId: string | null }): string => {
  if (!account.yourPropFirmId) {
    throw new PlatformError('This account is not linked to a trading platform yet', {}, 400);
  }
  return account.yourPropFirmId;
};

const requirePlatformUserId = (user: { platformUserId: string | null }): string => {
  if (!user.platformUserId) {
    throw new PlatformError('This user is not linked to a trading platform yet', {}, 400);
  }
  return user.platformUserId;
};

// =============================================================================
// Account Queries
// =============================================================================

/**
 * **STORED** — list the authenticated user's accounts from Prisma.
 * Supports `?live=true` to refresh all accounts from the provider first.
 */
export const getUserAccounts = async (userId: string, live = false) => {
  if (live) {
    await refreshUserAccountsFromPlatform(userId);
  }

  return prisma.account.findMany({
    where: { userId, deletedAt: null },
    include: {
      accountType: {
        select: {
          id: true,
          name: true,
          displayName: true,
          accountSize: true,
          profitSplit: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * **STORED + LIVE merge** — local metadata merged with a live snapshot.
 */
export const getAccountDetail = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
    include: {
      accountType: {
        select: {
          id: true,
          name: true,
          displayName: true,
          accountSize: true,
          profitSplit: true,
        },
      },
      challenges: {
        where: { status: 'ACTIVE' },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  let liveData = null;
  if (account.yourPropFirmId) {
    try {
      const provider = getTradingPlatformProvider();
      liveData = await provider.getAccount(account.yourPropFirmId);
    } catch (err) {
      logger.warn(
        { err, accountId, platformId: account.yourPropFirmId },
        'Failed to fetch live account data — returning stored only'
      );
    }
  }

  return {
    ...account,
    live: liveData,
  };
};

/**
 * **LIVE** — real-time balance, equity, P&L direct from provider.
 */
export const getAccountLiveSnapshot = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const platformAccountId = requirePlatformAccountId(account);
  const provider = getTradingPlatformProvider();

  return provider.getAccount(platformAccountId);
};

/**
 * **LIVE** — on-demand report computed by the trading platform.
 */
export const getAccountReport = async (
  accountId: string,
  userId: string,
  startDt: Date,
  endDt?: Date
): Promise<PlatformReportResult> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const platformAccountId = requirePlatformAccountId(account);
  const provider = getTradingPlatformProvider();

  return provider.getAccountReport(platformAccountId, startDt, endDt);
};

// =============================================================================
// Stored Data
// =============================================================================

/**
 * **STORED** — daily snapshots from Prisma. Supports `?live=true` to force
 * a platform pull + DB sync before responding.
 */
export const getAccountSnapshots = async (accountId: string, userId: string, live = false) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  if (live && account.yourPropFirmId) {
    try {
      const provider = getTradingPlatformProvider();
      const platformSnapshots = await provider.getDailySnapshots(account.yourPropFirmId);
      await syncService.syncSnapshotsFromPlatform(accountId, platformSnapshots);
    } catch (err) {
      logger.warn({ err, accountId }, 'Failed live snapshot sync — returning stored');
    }
  }

  return prisma.dailySnapshot.findMany({
    where: { accountId },
    orderBy: { date: 'desc' },
  });
};

/**
 * **STORED** — historical trades from Prisma. Supports `?live=true` to force
 * a platform pull + DB sync before responding.
 */
export const getAccountTrades = async (accountId: string, userId: string, live = false) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  if (live && account.yourPropFirmId) {
    try {
      const provider = getTradingPlatformProvider();
      const platformTrades = await provider.getHistoricalTrades(
        account.yourPropFirmId,
        account.createdAt
      );
      await syncService.syncTradesFromPlatform(accountId, platformTrades);
    } catch (err) {
      logger.warn({ err, accountId }, 'Failed live trade sync — returning stored');
    }
  }

  return prisma.trade.findMany({
    where: { accountId },
    orderBy: { entryTime: 'desc' },
  });
};

// =============================================================================
// Account Actions
// =============================================================================

/**
 * **LIVE + on-write sync** — resets the account on the provider, then updates
 * the local DB with the result.
 */
export const resetAccount = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const platformAccountId = requirePlatformAccountId(account);
  const provider = getTradingPlatformProvider();

  const result = await provider.resetAccount(platformAccountId);
  await syncService.syncAccountFromPlatform(accountId, result);

  return result;
};

// =============================================================================
// Dashboard / Login URLs
// =============================================================================

/**
 * **LIVE** — generates a one-time-use login URL from the provider.
 */
export const getDashboardUrl = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const platformUserId = requirePlatformUserId(user);
  const provider = getTradingPlatformProvider();

  return { url: await provider.getLoginUrl(platformUserId) };
};

/**
 * **LIVE** — generates an iFrame embed URL from the provider.
 */
export const getIFrameUrl = async (userId: string, accountId?: string | undefined) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const platformUserId = requirePlatformUserId(user);

  let platformAccountId: string | undefined;
  if (accountId) {
    const account = await prisma.account.findUnique({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) throw new NotFoundError('Account not found');
    if (account.userId !== userId) throw new ForbiddenError('Not your account');
    platformAccountId = account.yourPropFirmId ?? undefined;
  }

  const provider = getTradingPlatformProvider();

  return { url: await provider.getIFrameUrl(platformUserId, undefined, platformAccountId) };
};

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Refresh all of a user's accounts from the platform into Prisma.
 */
const refreshUserAccountsFromPlatform = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.platformUserId) return;

  const platformUserId = user.platformUserId;

  try {
    const provider = getTradingPlatformProvider();
    const platformAccounts = await provider.getAccountsByUser(platformUserId);

    for (const pa of platformAccounts) {
      const localAccount = await prisma.account.findUnique({
        where: { yourPropFirmId: pa.platformAccountId },
      });

      if (localAccount) {
        await syncService.syncAccountFromPlatform(localAccount.id, pa);
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to refresh accounts from platform');
  }
};
