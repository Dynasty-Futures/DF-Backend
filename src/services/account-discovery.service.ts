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

import {
  AccountStatus,
  ChallengePhase,
  ChallengeStatus,
  Prisma,
} from '@prisma/client';
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

// YPF AccountState values that mean the account failed (breached its rules).
const YPF_BREACHED_STATES = ['Breached', 'breached'];

// Program-catalog maps, built once per sweep, that let us resolve an account's
// programId to its DF AccountType + phase. YPF chains programs via
// `nextProgramId` (eval → funded), and the program with no successor is the
// funded/terminal one. We seed AccountTypes only against EVALUATION programs,
// so a funded account's programId won't match directly — we walk back to its
// evaluation predecessor.
interface ProgramMaps {
  /** programId → has a successor (i.e. is an evaluation/non-terminal program). */
  hasNext: Map<string, boolean>;
  /** funded programId → its evaluation predecessor programId. */
  evalByFunded: Map<string, string>;
}

const buildProgramMaps = (
  programs: { programId: string; nextProgramId?: string | undefined }[],
): ProgramMaps => {
  const hasNext = new Map<string, boolean>();
  const evalByFunded = new Map<string, string>();
  for (const p of programs) {
    // YPF returns `nextProgramId: null` (not undefined) for terminal/funded
    // programs, so use a truthy check — `!== undefined` would treat null as a
    // successor and misclassify funded accounts as evaluation.
    const hasSuccessor = Boolean(p.nextProgramId);
    hasNext.set(p.programId, hasSuccessor);
    if (hasSuccessor && p.nextProgramId) {
      evalByFunded.set(p.nextProgramId, p.programId);
    }
  }
  return { hasNext, evalByFunded };
};

// Whether a program is the funded (terminal) phase. MUST be read from the
// program catalog — the tenant-account / account-GET responses never populate
// `nextProgramName`, so inferring phase from the account payload alone
// misclassifies every evaluation account as funded.
const isFundedProgram = (
  programId: string | undefined,
  hasNext: Map<string, boolean>,
): boolean => {
  if (programId === undefined) return false;
  // Unknown program → assume evaluation (safer than mislabeling as funded).
  return hasNext.get(programId) === false;
};

// Resolve a YPF programId to a seeded AccountType. Tries a direct match first
// (evaluation accounts), then falls back to the program's evaluation
// predecessor (funded accounts sit on a funded program we don't seed directly).
type AccountTypeWithRules = Prisma.AccountTypeGetPayload<{
  include: { challengeRules: true };
}>;

const resolveAccountType = async (
  programId: string,
  evalByFunded: Map<string, string>,
): Promise<AccountTypeWithRules | null> => {
  const direct = await prisma.accountType.findFirst({
    where: { ypfProgramId: programId },
    include: { challengeRules: true },
  });
  if (direct) return direct;

  const evalProgramId = evalByFunded.get(programId);
  if (!evalProgramId) return null;

  return prisma.accountType.findFirst({
    where: { ypfProgramId: evalProgramId },
    include: { challengeRules: true },
  });
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

  // Program catalog maps (phase + funded→eval predecessor). One call, reused
  // across all accounts.
  let programMaps: ProgramMaps = {
    hasNext: new Map(),
    evalByFunded: new Map(),
  };
  try {
    programMaps = buildProgramMaps(await provider.listPrograms());
  } catch (err) {
    logger.warn({ err }, 'account-discovery: failed to load program catalog');
  }

  for (const acct of accounts) {
    try {
      await discoverOne(acct, result, programMaps);
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
  programMaps: ProgramMaps,
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
  const accountType = await resolveAccountType(
    acct.programId,
    programMaps.evalByFunded,
  );
  if (!accountType) {
    result.skippedNoProgram++;
    logger.warn(
      { platformAccountId: acct.platformAccountId, programId: acct.programId },
      'account-discovery: no AccountType linked to YPF program — run seed-ypf-programs',
    );
    return;
  }

  // 5. Derive local phase/status from the YPF program chain + account state.
  const funded = isFundedProgram(acct.programId, programMaps.hasNext);
  const breached = YPF_BREACHED_STATES.includes(acct.status);
  const phase = funded ? ChallengePhase.FUNDED : ChallengePhase.PHASE_1;
  // Breached accounts are failed regardless of phase; otherwise active.
  const status = breached
    ? AccountStatus.FAILED
    : funded
      ? AccountStatus.FUNDED
      : AccountStatus.EVALUATION;
  const challengeStatus = breached
    ? ChallengeStatus.FAILED
    : ChallengeStatus.ACTIVE;
  const phaseRules = accountType.challengeRules.find((r) => r.phase === phase);
  const now = new Date();

  // Anchor the starting balance to the AccountType's face value, NOT YPF's
  // `initialBalance` — that field is unreliable (it tracks the live balance on
  // some reads), which would skew Closed P&L, drawdown, and progress-to-target.
  // The account's true starting balance is its program/plan face value.
  const startingBalance = Number(accountType.accountSize);
  const currentBalance = acct.balance ?? startingBalance;
  const highWaterMark = Math.max(startingBalance, currentBalance);
  const extras = acct.extraValues ?? {};
  const volumetricaUserId = extras['VolumetricaUserId'] as string | undefined;
  const volumetricaAccountId = extras['VolumetricaAccountId'] as string | undefined;
  const volumetricaAccountNumber = extras['VolumetricaAccountNumber'] as
    | string
    | undefined;

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
        ...(funded && !breached && { fundedAt: now }),
        ...(breached && {
          failedAt: now,
          failedReason: 'Account breached on the trading platform',
        }),
        ...(volumetricaUserId && { volumetricaUserId }),
        ...(volumetricaAccountId && { volumetricaAccountId }),
        ...(volumetricaAccountNumber && { volumetricaAccountNumber }),
      },
    });

    await tx.challenge.create({
      data: {
        accountId: account.id,
        phase,
        status: challengeStatus,
        ...(breached && { completedAt: now }),
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
