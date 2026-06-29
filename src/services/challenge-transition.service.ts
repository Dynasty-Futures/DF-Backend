import {
  AccountStatus,
  ChallengePhase,
  ChallengeStatus,
  ViolationSeverity,
  ViolationType,
} from '@prisma/client';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Challenge Transition Service
// =============================================================================
// Handles challenge state transitions: failing accounts on rule violations
// and advancing accounts through phases (PHASE_1 → FUNDED).
//
// Under YPF, the phase progression on the platform is driven by YPF itself —
// each program declares a `nextProgramId`, and the YPF poller observes the
// state change. This service mirrors the transition into our local DB.
// =============================================================================

// ── Fail Challenge ──────────────────────────────────────────────────────────

export const failChallenge = async (
  accountId: string,
  reason: string,
  violationType: ViolationType = ViolationType.OTHER,
): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      challenges: {
        where: { status: ChallengeStatus.ACTIVE },
        take: 1,
      },
    },
  });

  if (!account) {
    logger.warn({ accountId }, 'failChallenge: account not found');
    return;
  }

  const activeChallenge = account.challenges[0];
  if (!activeChallenge) {
    logger.warn({ accountId }, 'failChallenge: no active challenge — skipping');
    return;
  }

  if (account.status === AccountStatus.FAILED) {
    logger.warn({ accountId }, 'failChallenge: account already failed — skipping');
    return;
  }

  logger.info(
    { accountId, challengeId: activeChallenge.id, reason },
    'Failing challenge',
  );

  await prisma.$transaction(async (tx) => {
    await tx.challenge.update({
      where: { id: activeChallenge.id },
      data: {
        status: ChallengeStatus.FAILED,
        completedAt: new Date(),
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.FAILED,
        failedAt: new Date(),
        failedReason: reason,
      },
    });

    await tx.ruleViolation.create({
      data: {
        accountId,
        type: violationType,
        severity: ViolationSeverity.CRITICAL,
        description: reason,
        causedFailure: true,
      },
    });
  });

  logger.info(
    { accountId, challengeId: activeChallenge.id },
    'Challenge failed and account updated',
  );
};

// ── Close Upgraded Account ──────────────────────────────────────────────────
// In YPF's model, passing the evaluation does NOT fund the account in place — a
// NEW account is created on the funded program and this one is retired with an
// `Upgraded` state. The new funded account is picked up separately by discovery
// / the poller, so we mark this retired row `UPGRADED` (NOT soft-deleted —
// deletedAt stays null) so it drops out of the active section and shows under
// "Inactive Accounts" labelled "Upgraded" (distinct from closed/violated). The
// evaluation genuinely passed, so its challenge is marked PASSED. Idempotent.

export const closeUpgradedAccount = async (accountId: string): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      challenges: {
        where: { status: ChallengeStatus.ACTIVE },
        take: 1,
      },
    },
  });

  if (!account) {
    logger.warn({ accountId }, 'closeUpgradedAccount: account not found');
    return;
  }

  if (account.status === AccountStatus.UPGRADED) {
    logger.debug({ accountId }, 'closeUpgradedAccount: already upgraded — skipping');
    return;
  }

  const activeChallenge = account.challenges[0];

  logger.info(
    { accountId, challengeId: activeChallenge?.id },
    'Marking account UPGRADED — superseded by a new funded account on YPF',
  );

  await prisma.$transaction(async (tx) => {
    if (activeChallenge) {
      await tx.challenge.update({
        where: { id: activeChallenge.id },
        data: {
          status: ChallengeStatus.PASSED,
          completedAt: new Date(),
        },
      });
    }

    await tx.account.update({
      where: { id: accountId },
      data: { status: AccountStatus.UPGRADED },
    });
  });

  logger.info({ accountId }, 'Account marked UPGRADED and moved to inactive');
};

// ── Reactivate Challenge ────────────────────────────────────────────────────
// YPF staff can reactivate a breached account on the CRM
// (AccountBreachedReactivated) — the account returns to Active upstream. We
// mirror that by reopening the failed challenge and restoring the account to
// the active status its phase implies. Inverse of failChallenge.

const ACTIVE_STATUS_FOR_PHASE: Record<ChallengePhase, AccountStatus> = {
  [ChallengePhase.PHASE_1]: AccountStatus.EVALUATION,
  [ChallengePhase.PHASE_2]: AccountStatus.PHASE_2,
  [ChallengePhase.FUNDED]: AccountStatus.FUNDED,
};

export const reactivateChallenge = async (accountId: string): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      challenges: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!account) {
    logger.warn({ accountId }, 'reactivateChallenge: account not found');
    return;
  }

  // Only a locally-failed account can be reactivated — guards against double
  // processing if the poller runs the reconcile twice.
  if (account.status !== AccountStatus.FAILED) {
    logger.debug(
      { accountId, status: account.status },
      'reactivateChallenge: account not failed — skipping',
    );
    return;
  }

  const challenge = account.challenges[0];
  if (!challenge) {
    logger.warn({ accountId }, 'reactivateChallenge: no challenge to reopen');
    return;
  }

  const restoredStatus = ACTIVE_STATUS_FOR_PHASE[challenge.phase];

  logger.info(
    { accountId, challengeId: challenge.id, restoredStatus },
    'Reactivating challenge (YPF account reactivated)',
  );

  await prisma.$transaction(async (tx) => {
    await tx.challenge.update({
      where: { id: challenge.id },
      data: { status: ChallengeStatus.ACTIVE, completedAt: null },
    });

    await tx.account.update({
      where: { id: accountId },
      data: { status: restoredStatus, failedAt: null, failedReason: null },
    });

    // The breach that failed this account was reversed upstream; the prior
    // failure-causing violations no longer cause a failure.
    await tx.ruleViolation.updateMany({
      where: { accountId, causedFailure: true },
      data: { causedFailure: false },
    });
  });

  logger.info({ accountId }, 'Challenge reactivated and account restored');
};

// ── Advance Challenge ───────────────────────────────────────────────────────

export const advanceChallenge = async (accountId: string): Promise<void> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      challenges: {
        where: { status: ChallengeStatus.ACTIVE },
        take: 1,
      },
      accountType: { include: { challengeRules: true } },
    },
  });

  if (!account) {
    logger.warn({ accountId }, 'advanceChallenge: account not found');
    return;
  }

  const activeChallenge = account.challenges[0];
  if (!activeChallenge) {
    logger.warn(
      { accountId },
      'advanceChallenge: no active challenge — skipping',
    );
    return;
  }

  if (activeChallenge.status !== ChallengeStatus.ACTIVE) {
    logger.warn(
      { accountId },
      'advanceChallenge: challenge not active — skipping',
    );
    return;
  }

  if (activeChallenge.phase !== ChallengePhase.PHASE_1) {
    logger.warn(
      { accountId, phase: activeChallenge.phase },
      'advanceChallenge: only PHASE_1 challenges can advance',
    );
    return;
  }

  const fundedRules = account.accountType.challengeRules.find(
    (r) => r.phase === ChallengePhase.FUNDED,
  );

  if (!fundedRules) {
    logger.error(
      { accountId, accountType: account.accountType.name },
      'advanceChallenge: no FUNDED phase rules configured — cannot advance',
    );
    return;
  }

  logger.info(
    { accountId, challengeId: activeChallenge.id },
    'Advancing challenge from PHASE_1 to FUNDED',
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.challenge.update({
      where: { id: activeChallenge.id },
      data: {
        status: ChallengeStatus.PASSED,
        completedAt: now,
      },
    });

    await tx.challenge.create({
      data: {
        accountId,
        phase: ChallengePhase.FUNDED,
        status: ChallengeStatus.ACTIVE,
        profitTarget: fundedRules.profitTarget,
        maxDailyLoss: fundedRules.maxDailyLoss,
        maxTotalDrawdown: fundedRules.maxTotalDrawdown,
        minTradingDays: fundedRules.minTradingDays,
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.FUNDED,
        passedAt: now,
        fundedAt: now,
      },
    });
  });

  logger.info({ accountId }, 'Challenge advanced to FUNDED');
};
