// =============================================================================
// Account Discovery Service (pull-based provisioning)
// =============================================================================
// Background: traders purchase challenges on YPF's WooCommerce/Worthy storefront,
// where YPF (not DF) creates the trading account. DF therefore never learns the
// account exists, so the dashboard stays empty. The old Stripe-webhook
// `provisionAccount` push is gone.
//
// This service flips provisioning push→pull: it sweeps YPF's tenant accounts,
// matches each back to a DF user by email + to an AccountType by YPF programId,
// and creates the local Account + Challenge row. From the next tick the existing
// YPF poller owns the account (balances, trades, breaches, phase transitions).
//
// Idempotent: an account whose platformAccountId already exists locally is
// skipped, so it is safe to run repeatedly on a cron.
// =============================================================================

import { AccountStatus, ChallengePhase, ChallengeStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { getTradingPlatformProvider } from '../providers/index.js';
import type { PlatformAccountResult } from '../providers/types.js';

export interface DiscoveryResult {
  scanned: number;
  created: number;
  skippedExisting: number;
  skippedNoEmail: number;
  skippedNoUser: number;
  skippedNoProgram: number;
  failed: number;
}

// Whether a program is the funded (terminal) phase. YPF chains programs via
// `nextProgramId`; the program with no successor is the funded one. NOTE: this
// MUST be read from the program catalog — the tenant-account / account-GET
// responses never populate `nextProgramName`, so inferring phase from the
// account payload alone misclassifies every evaluation account as funded.
const isFundedProgram = (
  programId: string | undefined,
  programHasNext: Map<string, boolean>,
): boolean => {
  if (programId === undefined) return false;
  const hasNext = programHasNext.get(programId);
  // Unknown program → assume evaluation (safer than mislabeling as funded).
  return hasNext === false;
};

/**
 * Sweep YPF tenant accounts and create local rows for any not yet linked to a
 * DF user. Returns a tally for observability. Never throws on a single bad
 * account — it logs and moves on so one failure can't stall the sweep.
 */
export const discoverAccounts = async (): Promise<DiscoveryResult> => {
  const result: DiscoveryResult = {
    scanned: 0,
    created: 0,
    skippedExisting: 0,
    skippedNoEmail: 0,
    skippedNoUser: 0,
    skippedNoProgram: 0,
    failed: 0,
  };

  const provider = getTradingPlatformProvider();
  const statuses = config.ypf.discovery.statuses;

  // Sweep each configured YPF status (e.g. Active, Upgraded). De-dupe by
  // platformAccountId in case a status filter returns overlapping rows.
  const seen = new Set<string>();
  const accounts: PlatformAccountResult[] = [];
  for (const status of statuses) {
    const batch = await provider.listTenantAccounts(status).catch((err) => {
      logger.warn({ err, status }, 'account-discovery: listTenantAccounts failed');
      return [] as PlatformAccountResult[];
    });
    for (const acct of batch) {
      if (seen.has(acct.platformAccountId)) continue;
      seen.add(acct.platformAccountId);
      accounts.push(acct);
    }
  }

  result.scanned = accounts.length;

  // Resolve phase from the program catalog: a program with no `nextProgramId`
  // is the funded/terminal phase. One call, reused across all accounts.
  const programHasNext = new Map<string, boolean>();
  try {
    const programs = await provider.listPrograms();
    for (const p of programs) {
      programHasNext.set(p.programId, p.nextProgramId !== undefined);
    }
  } catch (err) {
    logger.warn({ err }, 'account-discovery: failed to load program catalog');
  }

  for (const acct of accounts) {
    try {
      await discoverOne(acct, result, programHasNext);
    } catch (err) {
      result.failed++;
      logger.error(
        { err, platformAccountId: acct.platformAccountId },
        'account-discovery: failed to link account',
      );
    }
  }

  logger.info(result, 'account-discovery: sweep complete');
  return result;
};

const discoverOne = async (
  acct: PlatformAccountResult,
  result: DiscoveryResult,
  programHasNext: Map<string, boolean>,
): Promise<void> => {
  // 1. Idempotency — already linked locally?
  const existing = await prisma.account.findUnique({
    where: { platformAccountId: acct.platformAccountId },
    select: { id: true },
  });
  if (existing) {
    result.skippedExisting++;
    return;
  }

  // 2. Need an email to attribute the purchase to a DF user.
  const email = acct.email?.trim();
  if (!email) {
    result.skippedNoEmail++;
    logger.warn(
      { platformAccountId: acct.platformAccountId },
      'account-discovery: YPF account has no email — cannot link',
    );
    return;
  }

  // 3. Match the buyer to a DF user (case-insensitive — checkout emails vary).
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, platformUserId: true },
  });
  if (!user) {
    result.skippedNoUser++;
    logger.warn(
      { platformAccountId: acct.platformAccountId, email },
      'account-discovery: no DF user matches checkout email — unlinked purchase',
    );
    return;
  }

  // 4. Match the YPF program to a seeded AccountType.
  if (!acct.programId) {
    result.skippedNoProgram++;
    logger.warn(
      { platformAccountId: acct.platformAccountId, email },
      'account-discovery: YPF account has no programId',
    );
    return;
  }
  const accountType = await prisma.accountType.findFirst({
    where: { ypfProgramId: acct.programId },
    include: { challengeRules: true },
  });
  if (!accountType) {
    result.skippedNoProgram++;
    logger.warn(
      { platformAccountId: acct.platformAccountId, programId: acct.programId },
      'account-discovery: no AccountType linked to YPF program — run seed-ypf-programs',
    );
    return;
  }

  // 5. Derive local phase/status from the YPF program chain.
  const funded = isFundedProgram(acct.programId, programHasNext);
  const phase = funded ? ChallengePhase.FUNDED : ChallengePhase.PHASE_1;
  const status = funded ? AccountStatus.FUNDED : AccountStatus.EVALUATION;
  const phaseRules = accountType.challengeRules.find((r) => r.phase === phase);

  // Anchor the starting balance to the AccountType's face value, NOT YPF's
  // `initialBalance` — that field is unreliable (it tracks the live balance on
  // some reads), which would skew Closed P&L, drawdown, and progress-to-target.
  // The account's true starting balance is its program/plan face value.
  const startingBalance = Number(accountType.accountSize);
  const currentBalance = acct.balance ?? startingBalance;
  const highWaterMark = Math.max(startingBalance, currentBalance);
  const volumetricaUserId =
    (acct.extraValues?.['VolumetricaUserId'] as string | undefined) ?? undefined;

  // 6. Create local Account + Challenge, and backfill the user's platformUserId.
  await prisma.$transaction(async (tx) => {
    if (!user.platformUserId) {
      await tx.user.update({
        where: { id: user.id },
        data: { platformUserId: acct.platformUserId },
      });
    }

    const account = await tx.account.create({
      data: {
        userId: user.id,
        accountTypeId: accountType.id,
        status,
        startingBalance,
        currentBalance,
        highWaterMark,
        platformAccountId: acct.platformAccountId,
        platformUserId: acct.platformUserId,
        ...(funded && { fundedAt: new Date() }),
        ...(volumetricaUserId && { volumetricaUserId }),
      },
    });

    await tx.challenge.create({
      data: {
        accountId: account.id,
        phase,
        status: ChallengeStatus.ACTIVE,
        profitTarget: phaseRules?.profitTarget ?? 0,
        maxDailyLoss: phaseRules?.maxDailyLoss ?? 0,
        maxTotalDrawdown: phaseRules?.maxTotalDrawdown ?? 0,
        minTradingDays: phaseRules?.minTradingDays ?? 0,
      },
    });

    result.created++;
    logger.info(
      {
        accountId: account.id,
        userId: user.id,
        platformAccountId: acct.platformAccountId,
        programId: acct.programId,
        phase,
      },
      'account-discovery: linked YPF account to DF user',
    );
  });
};
