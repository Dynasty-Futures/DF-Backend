import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { PaymentError } from '../utils/errors.js';
import { AccountStatus, ChallengePhase, ChallengeStatus } from '@prisma/client';
import { getTradingPlatformProvider } from '../providers/index.js';

// =============================================================================
// Challenge Service
// =============================================================================

// Maps frontend plan types to how we look up AccountTypes in the DB.
// The AccountType.name field uses formats like "STANDARD_25K", "ADVANCED_50K", etc.
const buildAccountTypeName = (planType: string, accountSize: number): string => {
  const sizeLabel = accountSize >= 1000 ? `${accountSize / 1000}K` : `${accountSize}`;
  return `${planType.toUpperCase()}_${sizeLabel}`;
};

// Dynasty plan skips evaluation and goes straight to funded
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
  params: ProvisionAccountParams
): Promise<void> => {
  const { userId, planType, accountSize, stripePaymentId, amountPaid } = params;

  // Idempotency: check if we already provisioned for this payment
  const existingChallenge = await prisma.challenge.findFirst({
    where: { stripePaymentId },
  });

  if (existingChallenge) {
    logger.warn(
      { stripePaymentId, challengeId: existingChallenge.id },
      'Account already provisioned for this payment — skipping duplicate'
    );
    return;
  }

  const accountTypeName = buildAccountTypeName(planType, accountSize);

  const accountType = await prisma.accountType.findFirst({
    where: {
      name: accountTypeName,
      isActive: true,
    },
    include: {
      challengeRules: true,
    },
  });

  if (!accountType) {
    logger.error(
      { accountTypeName, planType, accountSize },
      'AccountType not found for provisioning'
    );
    throw new PaymentError(
      `No account type configured for ${planType} ${accountSize}. Payment was received but account could not be created. Please contact support.`
    );
  }

  const isDynasty = isDynastyPlan(planType);
  const initialPhase = isDynasty ? ChallengePhase.FUNDED : ChallengePhase.PHASE_1;
  const initialAccountStatus = isDynasty ? AccountStatus.FUNDED : AccountStatus.EVALUATION;

  // Find challenge rules for the initial phase
  const phaseRules = accountType.challengeRules.find(
    (r) => r.phase === initialPhase
  );

  const startingBalance = Number(accountType.accountSize);

  logger.info(
    {
      userId,
      accountTypeName,
      initialPhase,
      initialAccountStatus,
      startingBalance,
      stripePaymentId,
    },
    'Provisioning account after payment'
  );

  // ── Provision on trading platform ──────────────────────────────────────
  // Ensure the user exists on Volumetrica and create the trading account.
  // This happens BEFORE the local DB transaction so we have the platform IDs.

  let platformAccountId: string | undefined;

  try {
    const provider = getTradingPlatformProvider();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let platformUserId = user.platformUserId;

    if (!platformUserId) {
      logger.info({ userId }, 'Creating user on trading platform');

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

      logger.info(
        { userId, platformUserId },
        'Trading platform user created and linked',
      );
    }

    logger.info(
      { userId, platformUserId, startingBalance },
      'Creating trading account on platform',
    );

    const platformAccount = await provider.createAccount({
      platformUserId,
      accountName: `${accountTypeName} — ${stripePaymentId.slice(-8)}`,
      startingBalance,
    });

    platformAccountId = platformAccount.platformAccountId;

    logger.info(
      { userId, platformAccountId },
      'Trading platform account created',
    );
  } catch (err) {
    logger.error(
      { err, userId, stripePaymentId },
      'Failed to provision on trading platform — creating local account anyway',
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
        ...(platformAccountId && { yourPropFirmId: platformAccountId }),
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
