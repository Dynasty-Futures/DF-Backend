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

// =============================================================================
// YPF body builders
// =============================================================================
// CreateProgramRequest shape: rules are arrays of CreateRuleRequest objects,
// not flat objects with named fields. Each rule encodes a condition as
// (type, when, value, operator, threshold, calculationBase).
//
// Server environment is always Demo — prop-firm evaluations + funded accounts
// run on simulated rails (the firm carries P&L, not the trader).
//
// serverGroups maps each TradeServerVersion to a tenant-configured group name.
// 'Volumetrica' here is a placeholder — update to the real YPF group name
// before the first real challenge purchase.
// =============================================================================

const SERVER_TYPE = 'Demo' as const;
const VOLUMETRICA_GROUP = 'Volumetrica';

interface YPFRule {
  name: string;
  type: 'Profit' | 'Breach' | 'Withdrawal';
  when: string;
  value: string;
  operator: string;
  threshold: number;
  stringValue: string | null;
  calculationBase: 'Balance' | 'Equity';
}

const buildBreachRules = (rule: ChallengeRule): YPFRule[] => {
  const rules: YPFRule[] = [
    {
      name: 'Max Daily Loss',
      type: 'Breach',
      when: 'UserPlacesAPosition',
      value: 'DailyDrawDown',
      operator: 'MaxDrawDown',
      threshold: Number(rule.maxDailyLoss),
      stringValue: null,
      calculationBase: 'Balance',
    },
    {
      name: rule.drawdownType === 'trailing' ? 'Trailing Max Drawdown' : 'Max Drawdown',
      type: 'Breach',
      when: 'UserPlacesAPosition',
      value: rule.drawdownType === 'trailing' ? 'TrailingDrawdown' : 'DrawDown',
      operator: 'MaxDrawDown',
      threshold: Number(rule.maxTotalDrawdown),
      stringValue: null,
      calculationBase: rule.drawdownType === 'trailing' ? 'Equity' : 'Balance',
    },
  ];

  if (rule.maxPositionSize) {
    rules.push({
      name: 'Max Position Size',
      type: 'Breach',
      when: 'UserPlacesAPosition',
      value: 'MaxSymbolPosition',
      operator: 'MoreThan',
      threshold: rule.maxPositionSize,
      stringValue: null,
      calculationBase: 'Balance',
    });
  }

  return rules;
};

const buildProfitRules = (
  rule: ChallengeRule,
  phase: ChallengePhase,
): YPFRule[] => {
  // FUNDED accounts have no upgrade objectives.
  if (phase === ChallengePhase.FUNDED) return [];

  const rules: YPFRule[] = [
    {
      name: 'Profit Target',
      type: 'Profit',
      when: 'UserPlacesAPosition',
      value: 'ProfitTarget',
      operator: 'ReachesPercent',
      threshold: Number(rule.profitTarget),
      stringValue: null,
      calculationBase: 'Balance',
    },
    {
      name: 'Min Trading Days',
      type: 'Profit',
      when: 'UserPlacesAPosition',
      value: 'TradingDays',
      operator: 'ReachesValue',
      threshold: rule.minTradingDays,
      stringValue: null,
      calculationBase: 'Balance',
    },
  ];

  if (rule.consistencyRule && rule.maxSingleDayProfit) {
    rules.push({
      name: 'Daily Profit Consistency',
      type: 'Profit',
      when: 'UserPlacesAPosition',
      value: 'DailyProfitConsistency',
      operator: 'LessThanPercent',
      threshold: Number(rule.maxSingleDayProfit),
      stringValue: null,
      calculationBase: 'Balance',
    });
  }

  return rules;
};

const buildWithdrawalRules = (
  accountType: AccountType,
  phase: ChallengePhase,
): YPFRule[] => {
  if (phase !== ChallengePhase.FUNDED) return [];
  return [
    {
      name: 'Minimum Payout Amount',
      type: 'Withdrawal',
      when: 'UserRequestWithdraw',
      value: 'Profit',
      operator: 'MoreThan',
      threshold: Number(accountType.minPayoutAmount),
      stringValue: null,
      calculationBase: 'Balance',
    },
  ];
};

const buildProgramBody = (
  accountType: AccountType,
  rule: ChallengeRule,
  phase: ChallengePhase,
  nextProgramId: string | null,
): Record<string, unknown> => {
  const initialBalance = Number(accountType.accountSize);
  // The absolute equity floor — initial balance minus the configured drawdown.
  const lowestEquity =
    initialBalance * (1 - Number(rule.maxTotalDrawdown) / 100);

  const body: Record<string, unknown> = {
    name: programNameFor(accountType, phase),
    description: accountType.description ?? `${accountType.displayName} ${phase}`,
    isEnabled: true,
    type: SERVER_TYPE,
    serverGroups: { Volumetrica: VOLUMETRICA_GROUP },
    customLeverage: {},
    initialBalance,
    lowestEquity,
    maxTradingDays: rule.maxTradingDays ?? 0,
    isWithdrawalAllowed: phase === ChallengePhase.FUNDED,
    profitSplit: phase === ChallengePhase.FUNDED ? accountType.profitSplit : 0,
    breachRules: buildBreachRules(rule),
    profitRules: buildProfitRules(rule, phase),
    withdrawalRules: buildWithdrawalRules(accountType, phase),
    currency: 'USD',
    isRequireKYC: false,
  };

  if (nextProgramId) body.nextProgramId = nextProgramId;
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
