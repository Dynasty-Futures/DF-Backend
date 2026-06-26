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
import { getVolumetricaIFrameUrl } from '../providers/volumetrica/volumetrica-sso.js';
import { config } from '../config/index.js';
import * as syncService from './sync.service.js';

// =============================================================================
// Helpers
// =============================================================================

interface PlatformIdsAccount {
  platformAccountId: string | null;
  platformUserId: string | null;
}

const requirePlatformIds = (
  account: PlatformIdsAccount,
): { platformUserId: string; platformAccountId: string } => {
  if (!account.platformAccountId || !account.platformUserId) {
    throw new PlatformError(
      'This account is not linked to a trading platform yet',
      {},
      400,
    );
  }
  return {
    platformUserId: account.platformUserId,
    platformAccountId: account.platformAccountId,
  };
};

const requirePlatformUserId = (user: { platformUserId: string | null }): string => {
  if (!user.platformUserId) {
    throw new PlatformError(
      'This user is not linked to a trading platform yet',
      {},
      400,
    );
  }
  return user.platformUserId;
};

const requireVolumetricaUserId = async (userId: string): Promise<string> => {
  const account = await prisma.account.findFirst({
    where: { userId, volumetricaUserId: { not: null } },
    select: { volumetricaUserId: true },
  });
  if (!account?.volumetricaUserId) {
    throw new PlatformError(
      'Volumetrica SSO not available for this user — no linked account exposes a VolumetricaUserId yet',
      {},
      400,
    );
  }
  return account.volumetricaUserId;
};

// Earliest date to pull trade history from. For accounts created by the pull-
// based discovery flow, the local `createdAt` is when DF *discovered* the
// account — which can be later than when it started trading on YPF — so trades
// would be filtered out. Floor the start at a generous lookback so existing
// history is always captured.
const TRADE_HISTORY_LOOKBACK_DAYS = 365;
const tradeHistoryStart = (accountCreatedAt: Date): Date => {
  const floor = new Date();
  floor.setDate(floor.getDate() - TRADE_HISTORY_LOOKBACK_DAYS);
  return accountCreatedAt < floor ? accountCreatedAt : floor;
};

// =============================================================================
// Account Queries
// =============================================================================

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
          price: true,
        },
      },
      challenges: {
        select: {
          id: true,
          phase: true,
          status: true,
          amountPaid: true,
          startedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

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
  if (account.platformAccountId && account.platformUserId) {
    try {
      const provider = getTradingPlatformProvider();
      liveData = await provider.getAccount(
        account.platformUserId,
        account.platformAccountId,
      );
    } catch (err) {
      logger.warn(
        {
          err,
          accountId,
          platformAccountId: account.platformAccountId,
        },
        'Failed to fetch live account data — returning stored only',
      );
    }
  }

  return { ...account, live: liveData };
};

export const getAccountLiveSnapshot = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const ids = requirePlatformIds(account);
  const provider = getTradingPlatformProvider();

  return provider.getAccount(ids.platformUserId, ids.platformAccountId);
};

// =============================================================================
// Stored Data
// =============================================================================

export const getAccountSnapshots = async (
  accountId: string,
  userId: string,
  live = false,
) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  if (live && account.platformAccountId && account.platformUserId) {
    try {
      const provider = getTradingPlatformProvider();
      const platformSnapshots = await provider.getDailySnapshots(
        account.platformUserId,
        account.platformAccountId,
      );
      await syncService.syncSnapshotsFromPlatform(accountId, platformSnapshots);
    } catch (err) {
      logger.warn(
        { err, accountId },
        'Failed live snapshot sync — returning stored',
      );
    }
  }

  return prisma.dailySnapshot.findMany({
    where: { accountId },
    orderBy: { date: 'desc' },
  });
};

export const getAccountTrades = async (
  accountId: string,
  userId: string,
  live = false,
) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  if (live && account.platformAccountId && account.platformUserId) {
    try {
      const provider = getTradingPlatformProvider();
      const platformTrades = await provider.getHistoricalTrades(
        account.platformUserId,
        account.platformAccountId,
        tradeHistoryStart(account.createdAt),
      );
      await syncService.syncTradesFromPlatform(accountId, platformTrades);
    } catch (err) {
      logger.warn(
        { err, accountId },
        'Failed live trade sync — returning stored',
      );
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

export const resetAccount = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const ids = requirePlatformIds(account);
  const provider = getTradingPlatformProvider();

  const result = await provider.resetAccount(ids.platformUserId, ids.platformAccountId);
  await syncService.syncAccountFromPlatform(accountId, result);

  return result;
};

// =============================================================================
// Dashboard / Login URLs (Volumetrica-direct SSO; orthogonal to YPF mgmt plane)
// =============================================================================

export const getDashboardUrl = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  // The "Launch Platform" button sends the trader to the hosted Volumetrica
  // portal, where they self-authenticate with the email + per-account password
  // surfaced on their dashboard. We deliberately do NOT mint an SSO token here:
  // our Propsite key authenticates to the wrong Volumetrica org for
  // YPF-provisioned traders ("User not found"), so token minting is dead. The
  // static portal login URL is the working path.
  return { url: config.volumetrica.portalUrl };
};

export const getIFrameUrl = async (
  userId: string,
  accountId?: string | undefined,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  requirePlatformUserId(user);

  let volumetricaUserId: string;
  let volumetricaAccountId: string | undefined;

  if (accountId) {
    const account = await prisma.account.findUnique({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) throw new NotFoundError('Account not found');
    if (account.userId !== userId) throw new ForbiddenError('Not your account');
    if (!account.volumetricaUserId) {
      throw new PlatformError(
        'This account does not have a Volumetrica SSO mapping yet',
        {},
        400,
      );
    }
    volumetricaUserId = account.volumetricaUserId;
    // Scope the embed to this specific Volumetrica account (the GUID, persisted
    // from YPF extraValues) so the trader lands on the right account.
    volumetricaAccountId = account.volumetricaAccountId ?? undefined;
  } else {
    volumetricaUserId = await requireVolumetricaUserId(userId);
  }

  // Embed the full Volumetrica web trading app (the same surface YPF's
  // white-label embeds), not the read-only dashboard widget.
  return {
    url: await getVolumetricaIFrameUrl(
      volumetricaUserId,
      'webApp',
      volumetricaAccountId,
    ),
  };
};

// =============================================================================
// Internal Helpers
// =============================================================================

const refreshUserAccountsFromPlatform = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.platformUserId) return;

  const platformUserId = user.platformUserId;

  try {
    const provider = getTradingPlatformProvider();
    const platformAccounts = await provider.listUserAccounts(platformUserId);

    for (const pa of platformAccounts) {
      const localAccount = await prisma.account.findUnique({
        where: { platformAccountId: pa.platformAccountId },
      });

      if (localAccount) {
        await syncService.syncAccountFromPlatform(localAccount.id, pa);
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to refresh accounts from platform');
  }
};
