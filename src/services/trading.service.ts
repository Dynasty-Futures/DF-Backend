// =============================================================================
// Trading Service — Hybrid Live/Stored Strategy
// =============================================================================
// Each function documents whether data is LIVE (pass-through to provider) or
// STORED (read from Prisma). Some endpoints support a forced refresh via the
// `live` flag, which triggers a provider call + DB update before responding.
// =============================================================================

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  PlatformError,
  ServiceUnavailableError,
} from '../utils/errors.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import { getVolumetricaIFrameUrl } from '../providers/volumetrica/volumetrica-sso.js';
import { config } from '../config/index.js';
import * as syncService from './sync.service.js';
import * as ypfSyncService from './ypf-sync.service.js';

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
          payoutCycleCap: true,
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
          payoutCycleCap: true,
        },
      },
      // Most-recent challenge of ANY status — a breached/failed account has no
      // ACTIVE challenge, but the dashboard still needs its rules (profit
      // target, max loss) to render the correct plan values instead of generic
      // fallbacks. The current phase is always the newest challenge.
      challenges: {
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

/**
 * Request an evaluation → funded upgrade for an account that has met its profit
 * target. Mirrors YPF's own dashboard "Upgrade Account" button (the `/upgrade`
 * endpoint, which respects the platform's `isLevelUpReached` eligibility gate).
 *
 * We pre-screen on YPF's OWN signal so the trader gets a clean error instead of
 * a raw 400: read the live account, and block only when YPF explicitly reports
 * the level-up has NOT been reached. If the flag is absent (undefined), stay
 * permissive and let YPF be the final authority. After the upgrade we run the
 * normal YPF sync so the local challenge advances to FUNDED immediately; the
 * 1-minute poller is the backstop.
 *
 * NOTE: Standard accounts are NOT upgraded here — going funded on a Standard
 * plan requires a paid $80 activation (a WooCommerce checkout → YPF's
 * `/activation`), so a free `/upgrade` would let the trader skip the fee. We
 * reject Standard defensively; the dashboard routes them to the activation
 * checkout instead. Advanced/Builder (Dynasty) have no activation fee.
 */
export const requestUpgrade = async (accountId: string, userId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
    include: { accountType: { select: { name: true } } },
  });

  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  if (account.accountType?.name?.toUpperCase().startsWith('STANDARD')) {
    throw new BadRequestError(
      'Standard accounts go funded via a paid activation, not a direct upgrade. Use the activation checkout.',
    );
  }

  const ids = requirePlatformIds(account);
  const provider = getTradingPlatformProvider();

  // Read YPF's own eligibility verdict before attempting the upgrade.
  const live = await provider.getAccount(
    ids.platformUserId,
    ids.platformAccountId,
  );
  // YPF only upgrades an Active account; once requested it moves to
  // `UpgradePending` and a second `/upgrade` 400s ("Account is not active").
  // Catch any non-Active state here for a clean message + to keep the button
  // from looping on the error.
  if (live.upgradeRequestDate || live.status !== 'Active') {
    throw new BadRequestError(
      'This account is already being upgraded — it should finish shortly.',
    );
  }
  if (live.isLevelUpReached === false) {
    throw new BadRequestError(
      "This account hasn't met the profit target required to upgrade yet.",
    );
  }

  const result = await provider.upgradeAccount(
    ids.platformUserId,
    ids.platformAccountId,
  );

  // Reconcile immediately so the dashboard reflects FUNDED without waiting for
  // the next poll. Best-effort — the upgrade already succeeded upstream, so a
  // sync hiccup must not surface as a failed request (the poller will catch up).
  try {
    await ypfSyncService.syncAccountFromYPF({
      localAccountId: accountId,
      liveAccount: result,
    });
  } catch (err) {
    logger.warn(
      { err, accountId },
      'requestUpgrade: post-upgrade sync failed — poller will reconcile',
    );
  }

  return result;
};

// =============================================================================
// WooCommerce checkout deep-links (reset / activation)
// =============================================================================
// Both flows buy a product on YPF's WooCommerce store bound to a SPECIFIC
// account via a short-lived encrypted `ypf-ref` code we mint from YPF. YPF hands
// us the canonical per-program checkout URL (`accountResetUrl` / `activationUrl`,
// already carrying `?add-to-cart=…`); we just append a freshly-minted ref code
// and hand the trader a ready-to-open URL. The code expires in 5 minutes, so we
// mint on demand per click rather than caching.

export type CheckoutPurpose = 'reset' | 'activation';

export const getCheckoutUrl = async (
  accountId: string,
  userId: string,
  purpose: CheckoutPurpose,
): Promise<{ url: string }> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletedAt: null },
  });
  if (!account) throw new NotFoundError('Account not found');
  if (account.userId !== userId) throw new ForbiddenError('Not your account');

  const ids = requirePlatformIds(account);
  const provider = getTradingPlatformProvider();

  // Read the live account to resolve its CURRENT program (eval vs funded may
  // have advanced since our last sync), then pull that program's checkout URLs.
  const live = await provider.getAccount(
    ids.platformUserId,
    ids.platformAccountId,
  );
  if (!live.programId) {
    throw new BadRequestError(
      'This account is not linked to a trading program yet.',
    );
  }
  const program = await provider.getProgram(live.programId);

  const baseUrl =
    purpose === 'reset' ? program.accountResetUrl : program.activationUrl;
  if (!baseUrl) {
    throw new BadRequestError(
      purpose === 'reset'
        ? 'Resets are not available for this account yet.'
        : 'This account does not require activation.',
    );
  }

  // Mint the per-account ref code (5-min TTL). Null = YPF failed to generate it.
  const refCode = await provider.getRefCode(
    ids.platformUserId,
    ids.platformAccountId,
  );
  if (!refCode) {
    throw new ServiceUnavailableError(
      'Could not prepare checkout right now — please try again in a moment.',
    );
  }

  // Build the final URL from YPF's per-program checkout base + the minted ref
  // code. Three params work together (verified live against the WooCommerce
  // store's Store API cart):
  //   • `add-to-cart=<id>` — selects the reset/activation PRODUCT. Dropping it
  //     defaults the store to a generic "25k Standard Evaluation" (wrong product).
  //   • a MODE flag — tells WooCommerce this is a reset/activation, not a fresh
  //     purchase. Without it the store loops checkout↔cart ("too many redirects").
  //     YPF's `activationUrl` already carries `program-activation=1`, but its
  //     `accountResetUrl` OMITS `program-reset=true`, so we add it for resets.
  //   • `ypf-ref` — binds the purchase to this specific account.
  // add-to-cart=72 + program-reset=true + ypf-ref => correct reset product, no
  // loop; missing program-reset => loop; missing add-to-cart => wrong product.
  const url = new URL(baseUrl);
  if (purpose === 'reset') url.searchParams.set('program-reset', 'true');
  url.searchParams.set('ypf-ref', refCode);
  return { url: url.toString() };
};

// =============================================================================
// Dashboard / Login URLs (Volumetrica-direct SSO; orthogonal to YPF mgmt plane)
// =============================================================================

export const getDashboardUrl = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  // The "Launch Platform" button sends the trader to the hosted Volumetrica
  // portal, where they self-authenticate with the email + per-account password
  // surfaced on their dashboard. This is a deliberate "open in a new tab"
  // fallback; the seamless token-minted experience lives in the in-app Trade
  // embed (see getIFrameUrl, which mints a webApp jtoken). We intentionally do
  // NOT mint a token here so this path never depends on the Volumetrica API.
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
