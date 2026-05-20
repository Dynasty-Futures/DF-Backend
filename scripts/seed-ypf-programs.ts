// =============================================================================
// YPF Programs Seeder
// =============================================================================
// One-shot script that maps every local `AccountType` to a YPF `Program`.
//
// For each AccountType:
//   1. Look up an existing program by name on YPF (idempotent).
//   2. If absent, create one from the corresponding `ChallengeRule` rows.
//   3. Persist the YPF `programId` back onto `AccountType.ypfProgramId`.
//
// Phase progression: the PHASE_1 program links to its FUNDED program via
// YPF's `nextProgramId`, so traders auto-advance on the platform after they
// satisfy the upgrade rules.
//
// Run with:   tsx scripts/seed-ypf-programs.ts
// =============================================================================

import { PrismaClient, ChallengePhase, type AccountType, type ChallengeRule } from '@prisma/client';
import { YPFClient } from '../src/providers/ypf/ypf.client.js';
import { logger } from '../src/utils/logger.js';

interface YPFProgramShape {
  id: string;
  name: string;
  initialBalance: number;
  currency: string;
  nextProgramId?: string;
}

const prisma = new PrismaClient();
const client = new YPFClient();

const programNameFor = (
  accountType: AccountType,
  phase: ChallengePhase,
): string => `DF_${accountType.name}_${phase}`;

const findProgramByName = async (
  name: string,
): Promise<YPFProgramShape | null> => {
  const res = await client.get<YPFProgramShape[]>('/programs', { name });
  return res.find((p) => p.name === name) ?? null;
};

const createProgram = async (
  body: Record<string, unknown>,
): Promise<YPFProgramShape> => {
  return client.post<YPFProgramShape>('/programs', body);
};

const buildProgramBody = (
  accountType: AccountType,
  rule: ChallengeRule,
  phase: ChallengePhase,
  nextProgramId: string | null,
): Record<string, unknown> => {
  const balance = Number(accountType.accountSize);
  const breachRules: Record<string, unknown> = {
    maxDrawdownPercent: Number(rule.maxTotalDrawdown),
    maxDailyLossPercent: Number(rule.maxDailyLoss),
    drawdownType: rule.drawdownType,
  };
  if (rule.maxPositionSize) {
    breachRules['maxPositionSize'] = rule.maxPositionSize;
  }
  if (rule.maxOpenPositions) {
    breachRules['maxOpenPositions'] = rule.maxOpenPositions;
  }

  const profitRules: Record<string, unknown> = {};
  if (phase !== ChallengePhase.FUNDED) {
    profitRules['profitTargetPercent'] = Number(rule.profitTarget);
    profitRules['minTradingDays'] = rule.minTradingDays;
    if (rule.maxTradingDays) {
      profitRules['maxTradingDays'] = rule.maxTradingDays;
    }
  }
  if (rule.consistencyRule && rule.maxSingleDayProfit) {
    profitRules['maxSingleDayProfitPercent'] = Number(rule.maxSingleDayProfit);
  }

  const withdrawalRules: Record<string, unknown> = {};
  if (phase === ChallengePhase.FUNDED) {
    withdrawalRules['profitSplitPercent'] = accountType.profitSplit;
    withdrawalRules['minPayoutAmount'] = Number(accountType.minPayoutAmount);
    withdrawalRules['frequency'] = accountType.payoutFrequency;
  }

  const body: Record<string, unknown> = {
    name: programNameFor(accountType, phase),
    description: accountType.description ?? `${accountType.displayName} ${phase}`,
    currency: 'USD',
    initialBalance: balance,
    serverType: 'Volumetrica',
    isEnabled: true,
    isWithdrawalAllowed: phase === ChallengePhase.FUNDED,
    breachRules,
    profitRules,
    withdrawalRules,
  };
  if (nextProgramId) body['nextProgramId'] = nextProgramId;
  return body;
};

const seedProgramForPhase = async (
  accountType: AccountType & { challengeRules: ChallengeRule[] },
  phase: ChallengePhase,
  nextProgramId: string | null,
): Promise<string> => {
  const rule = accountType.challengeRules.find((r) => r.phase === phase);
  if (!rule) {
    throw new Error(
      `Missing ${phase} ChallengeRule for AccountType ${accountType.name}`,
    );
  }

  const name = programNameFor(accountType, phase);
  const existing = await findProgramByName(name);
  if (existing) {
    logger.info(
      { name, programId: existing.id },
      'YPF program already exists — reusing',
    );
    return existing.id;
  }

  const body = buildProgramBody(accountType, rule, phase, nextProgramId);
  const created = await createProgram(body);
  logger.info(
    { name, programId: created.id },
    'YPF program created',
  );
  return created.id;
};

const main = async (): Promise<void> => {
  logger.info('YPF program seed: starting');

  const accountTypes = await prisma.accountType.findMany({
    where: { isActive: true },
    include: { challengeRules: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (accountTypes.length === 0) {
    logger.warn('No active AccountType rows found — run npm run db:seed first');
    return;
  }

  for (const accountType of accountTypes) {
    logger.info({ accountType: accountType.name }, 'Seeding programs for AccountType');

    // FUNDED first so PHASE_1 can link via nextProgramId
    const fundedRule = accountType.challengeRules.find(
      (r) => r.phase === ChallengePhase.FUNDED,
    );

    let fundedProgramId: string | null = null;
    if (fundedRule) {
      fundedProgramId = await seedProgramForPhase(
        accountType,
        ChallengePhase.FUNDED,
        null,
      );
    }

    let runtimeProgramId: string;
    const phase1Rule = accountType.challengeRules.find(
      (r) => r.phase === ChallengePhase.PHASE_1,
    );

    if (phase1Rule) {
      // Standard/Advanced — start with PHASE_1
      runtimeProgramId = await seedProgramForPhase(
        accountType,
        ChallengePhase.PHASE_1,
        fundedProgramId,
      );
    } else if (fundedProgramId) {
      // Dynasty — instant FUNDED
      runtimeProgramId = fundedProgramId;
    } else {
      logger.error(
        { accountType: accountType.name },
        'AccountType has no ChallengeRule for either PHASE_1 or FUNDED — skipping',
      );
      continue;
    }

    await prisma.accountType.update({
      where: { id: accountType.id },
      data: { ypfProgramId: runtimeProgramId },
    });

    logger.info(
      { accountType: accountType.name, ypfProgramId: runtimeProgramId },
      'AccountType linked to YPF program',
    );
  }

  logger.info('YPF program seed: complete');
};

main()
  .catch((err) => {
    logger.error({ err }, 'YPF program seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
