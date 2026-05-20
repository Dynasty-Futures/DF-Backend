import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, PaymentError } from '../utils/errors.js';
import { AccountStatus, ChallengePhase, ChallengeStatus } from '@prisma/client';
import { getTradingPlatformProvider } from '../providers/index.js';

// =============================================================================
// Challenge Service
// =============================================================================

const buildAccountTypeName = (planType: string, accountSize: number): string => {
  const sizeLabel = accountSize >= 1000 ? `${accountSize / 1000}K` : `${accountSize}`;
  return `${planType.toUpperCase()}_${sizeLabel}`;
};

const isDynastyPlan = (planType: string): boolean =>
  planType.toLowerCase() === 'dynasty';

// =============================================================================
// Provision Account After Payment
// =============================================================================

interface ProvisionAccountParams {
  userId: string;
  planType: string;
  accountSize: number;
  stripePaymentId: string;
  amountPaid: number;
}

export const provisionAccount = async (
  params: ProvisionAccountParams,
): Promise<void> => {
  const { userId, planType, accountSize, stripePaymentId, amountPaid } = params;

  // Idempotency
  const existingChallenge = await prisma.challenge.findFirst({
    where: { stripePaymentId },
  });

  if (existingChallenge) {
    logger.warn(
      { stripePaymentId, challengeId: existingChallenge.id },
      'Account already provisioned for this payment — skipping duplicate',
    );
    return;
  }

  const accountTypeName = buildAccountTypeName(planType, accountSize);

  const accountType = await prisma.accountType.findFirst({
    where: { name: accountTypeName, isActive: true },
    include: { challengeRules: true },
  });

  if (!accountType) {
    logger.error(
      { accountTypeName, planType, accountSize },
      'AccountType not found for provisioning',
    );
    throw new PaymentError(
      `No account type configured for ${planType} ${accountSize}. Payment was received but account could not be created. Please contact support.`,
    );
  }

  if (!accountType.ypfProgramId) {
    logger.error(
      { accountTypeName, accountTypeId: accountType.id },
      'AccountType has no ypfProgramId — run scripts/seed-ypf-programs.ts',
    );
    throw new BadRequestError(
      `Account type ${accountTypeName} is not linked to a YPF program. Seed YPF programs before provisioning.`,
    );
  }

  const isDynasty = isDynastyPlan(planType);
  const initialPhase = isDynasty ? ChallengePhase.FUNDED : ChallengePhase.PHASE_1;
  const initialAccountStatus = isDynasty
    ? AccountStatus.FUNDED
    : AccountStatus.EVALUATION;

  const phaseRules = accountType.challengeRules.find((r) => r.phase === initialPhase);
  const startingBalance = Number(accountType.accountSize);

  logger.info(
    {
      userId,
      accountTypeName,
      ypfProgramId: accountType.ypfProgramId,
      initialPhase,
      initialAccountStatus,
      startingBalance,
      stripePaymentId,
    },
    'Provisioning account after payment',
  );

  // ── Provision on YPF ────────────────────────────────────────────────────
  let platformAccountId: string | undefined;
  let platformUserId: string | undefined;
  let volumetricaUserId: string | undefined;

  try {
    const provider = getTradingPlatformProvider();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    platformUserId = user.platformUserId ?? undefined;

    if (!platformUserId) {
      logger.info({ userId }, 'Creating user on YPF');

      const platformUser = await provider.createUser({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        country: 'US', // TODO: pull from user profile once country field is added
        phone: user.phone ?? undefined,
        externalId: user.id,
      });
      platformUserId = platformUser.platformUserId;

      await prisma.user.update({
        where: { id: userId },
        data: { platformUserId },
      });

      logger.info({ userId, platformUserId }, 'YPF user created and linked');
    }

    logger.info(
      { userId, platformUserId, ypfProgramId: accountType.ypfProgramId },
      'Creating YPF account on program',
    );

    const platformAccount = await provider.createAccount({
      platformUserId,
      programId: accountType.ypfProgramId,
      tradeServer: 'Volumetrica',
      currency: 'USD',
    });

    platformAccountId = platformAccount.platformAccountId;
    volumetricaUserId =
      (platformAccount.extraValues?.['VolumetricaUserId'] as string | undefined) ??
      undefined;

    logger.info(
      { userId, platformAccountId, hasVolumetricaUserId: !!volumetricaUserId },
      'YPF account created',
    );
  } catch (err) {
    logger.error(
      { err, userId, stripePaymentId },
      'Failed to provision on YPF — creating local account anyway',
    );
  }

  // ── Local DB transaction ────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        userId,
        accountTypeId: accountType.id,
        status: initialAccountStatus,
        startingBalance,
        currentBalance: startingBalance,
        highWaterMark: startingBalance,
        ...(isDynasty && { fundedAt: new Date() }),
        ...(platformAccountId && { platformAccountId }),
        ...(platformUserId && { platformUserId }),
        ...(volumetricaUserId && { volumetricaUserId }),
      },
    });

    await tx.challenge.create({
      data: {
        accountId: account.id,
        phase: initialPhase,
        status: ChallengeStatus.ACTIVE,
        profitTarget: phaseRules?.profitTarget ?? 0,
        maxDailyLoss: phaseRules?.maxDailyLoss ?? 0,
        maxTotalDrawdown: phaseRules?.maxTotalDrawdown ?? 0,
        minTradingDays: phaseRules?.minTradingDays ?? 0,
        stripePaymentId,
        amountPaid,
      },
    });

    logger.info(
      { accountId: account.id, userId, platformAccountId },
      'Account and challenge created successfully',
    );
  });
};
