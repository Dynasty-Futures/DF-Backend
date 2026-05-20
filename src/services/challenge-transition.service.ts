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
