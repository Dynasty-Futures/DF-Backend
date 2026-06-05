// =============================================================================
// Sync Service — On-Write Sync Helpers
// =============================================================================
// Called after any provider mutation to persist platform data into Prisma.
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import type {
  PlatformAccountResult,
  PlatformSnapshotResult,
  PlatformTradeResult,
  PlatformUserResult,
} from '../providers/types.js';

// =============================================================================
// User Sync
// =============================================================================

export const syncUserFromPlatform = async (
  localUserId: string,
  platformData: PlatformUserResult,
): Promise<void> => {
  logger.debug(
    { localUserId, platformUserId: platformData.platformUserId },
    'Syncing user from platform',
  );

  const data: Record<string, unknown> = {};

  if (platformData.firstName) data['firstName'] = platformData.firstName;
  if (platformData.lastName) data['lastName'] = platformData.lastName;
  if (platformData.phone) data['phone'] = platformData.phone;
  if (platformData.platformUserId) data['platformUserId'] = platformData.platformUserId;

  if (Object.keys(data).length > 0) {
    await prisma.user.update({
      where: { id: localUserId },
      data,
    });
  }
};

// =============================================================================
// Account Sync
// =============================================================================

export const syncAccountFromPlatform = async (
  localAccountId: string,
  platformData: PlatformAccountResult,
): Promise<void> => {
  logger.debug(
    { localAccountId, platformAccountId: platformData.platformAccountId },
    'Syncing account from platform',
  );

  // Surface VolumetricaUserId from extraValues if it just arrived
  const volumetricaUserId =
    (platformData.extraValues?.['VolumetricaUserId'] as string | undefined) ??
    undefined;

  await prisma.account.update({
    where: { id: localAccountId },
    data: {
      currentBalance: platformData.balance,
      platformAccountId: platformData.platformAccountId,
      platformUserId: platformData.platformUserId,
      ...(volumetricaUserId && { volumetricaUserId }),
      updatedAt: new Date(),
    },
  });
};

// =============================================================================
// Trade Sync
// =============================================================================

export const syncTradesFromPlatform = async (
  localAccountId: string,
  trades: PlatformTradeResult[],
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;

  for (const trade of trades) {
    const existing = trade.externalId
      ? await prisma.trade.findFirst({
          where: { accountId: localAccountId, externalId: trade.externalId },
        })
      : null;

    const metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull = trade.metadata
      ? (trade.metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    const data = {
      accountId: localAccountId,
      externalId: trade.externalId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice ?? null,
      realizedPnl: trade.realizedPnl ?? null,
      commission: trade.commission,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime ?? null,
      metadata,
    };

    if (existing) {
      await prisma.trade.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.trade.create({ data });
      created++;
    }
  }

  logger.info(
    { localAccountId, created, updated, total: trades.length },
    'Synced trades from platform',
  );

  return { created, updated };
};

// =============================================================================
// Snapshot Sync
// =============================================================================

export const syncSnapshotsFromPlatform = async (
  localAccountId: string,
  snapshots: PlatformSnapshotResult[],
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;

  for (const snap of snapshots) {
    const dateOnly = new Date(snap.date.toISOString().split('T')[0]!);

    const data = {
      accountId: localAccountId,
      date: dateOnly,
      openBalance: snap.openBalance,
      closeBalance: snap.closeBalance,
      highBalance: snap.highBalance,
      lowBalance: snap.lowBalance,
      dailyPnl: snap.dailyPnl,
      totalPnl: snap.totalPnl,
      dailyDrawdown: snap.dailyDrawdown,
      currentDrawdown: snap.currentDrawdown,
      tradesCount: snap.tradesCount,
      winningTrades: snap.winningTrades,
      losingTrades: snap.losingTrades,
    };

    try {
      await prisma.dailySnapshot.upsert({
        where: {
          accountId_date: { accountId: localAccountId, date: dateOnly },
        },
        update: data,
        create: data,
      });
      created++;
    } catch (err) {
      logger.warn(
        { err, localAccountId, date: dateOnly },
        'Failed to upsert snapshot',
      );
    }
  }

  updated = snapshots.length - created;

  logger.info(
    { localAccountId, synced: snapshots.length },
    'Synced snapshots from platform',
  );

  return { created, updated };
};
