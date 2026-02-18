import { PrismaClient, ChallengePhase } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// Account Type + Challenge Rule Seed Data
// =============================================================================
// Matches the pricing page exactly. All drawdown/profit percentages are
// relative to account size.

interface AccountTypeSeed {
  name: string;
  displayName: string;
  description: string;
  accountSize: number;
  price: number;
  resetPrice: number;
  profitSplit: number;
  minPayoutAmount: number;
  payoutFrequency: string;
  sortOrder: number;
  rules: ChallengeRuleSeed[];
}

interface ChallengeRuleSeed {
  phase: ChallengePhase;
  profitTarget: number;
  maxDailyLoss: number;
  maxTotalDrawdown: number;
  drawdownType: string;
  minTradingDays: number;
  maxTradingDays: number | null;
  consistencyRule: boolean;
  maxSingleDayProfit: number | null;
  newsRestriction: boolean;
  weekendRestriction: boolean;
}

// Drawdown/profit values per account size (dollar amounts from pricing page)
const sizeRules = {
  25000:  { profitTarget: 1500, maxDrawdown: 1500, dailyLoss: 750 },
  50000:  { profitTarget: 3000, maxDrawdown: 2500, dailyLoss: 1500 },
  100000: { profitTarget: 6000, maxDrawdown: 3000, dailyLoss: 2000 },
  150000: { profitTarget: 8000, maxDrawdown: 4500, dailyLoss: 3000 },
};

const toPercent = (dollar: number, accountSize: number) =>
  parseFloat(((dollar / accountSize) * 100).toFixed(2));

function buildStandardAccountTypes(): AccountTypeSeed[] {
  const pricing = [
    { size: 25000, price: 39, resetPrice: 35 },
    { size: 50000, price: 59, resetPrice: 45 },
    { size: 100000, price: 99, resetPrice: 65 },
    { size: 150000, price: 129, resetPrice: 75 },
  ];

  return pricing.map((p, i) => {
    const r = sizeRules[p.size as keyof typeof sizeRules];
    return {
      name: `STANDARD_${p.size / 1000}K`,
      displayName: `Standard ${p.size / 1000}K`,
      description: 'Pass first, activate later. $80 activation fee after passing.',
      accountSize: p.size,
      price: p.price,
      resetPrice: p.resetPrice,
      profitSplit: 80,
      minPayoutAmount: 500,
      payoutFrequency: '5-day',
      sortOrder: i + 1,
      rules: [
        {
          phase: ChallengePhase.PHASE_1,
          profitTarget: toPercent(r.profitTarget, p.size),
          maxDailyLoss: toPercent(r.dailyLoss, p.size),
          maxTotalDrawdown: toPercent(r.maxDrawdown, p.size),
          drawdownType: 'trailing',
          minTradingDays: 5,
          maxTradingDays: null,
          consistencyRule: true,
          maxSingleDayProfit: 50.00,
          newsRestriction: false,
          weekendRestriction: false,
        },
        {
          phase: ChallengePhase.FUNDED,
          profitTarget: 0,
          maxDailyLoss: toPercent(r.dailyLoss, p.size),
          maxTotalDrawdown: toPercent(r.maxDrawdown, p.size),
          drawdownType: 'static',
          minTradingDays: 0,
          maxTradingDays: null,
          consistencyRule: false,
          maxSingleDayProfit: null,
          newsRestriction: false,
          weekendRestriction: false,
        },
      ],
    };
  });
}

function buildAdvancedAccountTypes(): AccountTypeSeed[] {
  const pricing = [
    { size: 25000, price: 65, resetPrice: 35 },
    { size: 50000, price: 95, resetPrice: 45 },
    { size: 100000, price: 160, resetPrice: 65 },
    { size: 150000, price: 199, resetPrice: 75 },
  ];

  return pricing.map((p, i) => {
    const r = sizeRules[p.size as keyof typeof sizeRules];
    return {
      name: `ADVANCED_${p.size / 1000}K`,
      displayName: `Advanced ${p.size / 1000}K`,
      description: 'Instant activation, no activation fee.',
      accountSize: p.size,
      price: p.price,
      resetPrice: p.resetPrice,
      profitSplit: 80,
      minPayoutAmount: 500,
      payoutFrequency: '5-day',
      sortOrder: i + 5,
      rules: [
        {
          phase: ChallengePhase.PHASE_1,
          profitTarget: toPercent(r.profitTarget, p.size),
          maxDailyLoss: toPercent(r.dailyLoss, p.size),
          maxTotalDrawdown: toPercent(r.maxDrawdown, p.size),
          drawdownType: 'trailing',
          minTradingDays: 5,
          maxTradingDays: null,
          consistencyRule: false,
          maxSingleDayProfit: null,
          newsRestriction: false,
          weekendRestriction: false,
        },
        {
          phase: ChallengePhase.FUNDED,
          profitTarget: 0,
          maxDailyLoss: toPercent(r.dailyLoss, p.size),
          maxTotalDrawdown: toPercent(r.maxDrawdown, p.size),
          drawdownType: 'static',
          minTradingDays: 0,
          maxTradingDays: null,
          consistencyRule: false,
          maxSingleDayProfit: null,
          newsRestriction: false,
          weekendRestriction: false,
        },
      ],
    };
  });
}

function buildDynastyAccountTypes(): AccountTypeSeed[] {
  const pricing = [
    { size: 25000, price: 99, resetPrice: 200 },
    { size: 50000, price: 129, resetPrice: 275 },
    { size: 100000, price: 199, resetPrice: 325 },
    { size: 150000, price: 239, resetPrice: 375 },
  ];

  return pricing.map((p, i) => {
    const r = sizeRules[p.size as keyof typeof sizeRules];
    return {
      name: `DYNASTY_${p.size / 1000}K`,
      displayName: `Dynasty ${p.size / 1000}K`,
      description: 'Instant funding with daily payouts after $3,000 profit buffer.',
      accountSize: p.size,
      price: p.price,
      resetPrice: p.resetPrice,
      profitSplit: 80,
      minPayoutAmount: 500,
      payoutFrequency: 'daily',
      sortOrder: i + 9,
      rules: [
        {
          phase: ChallengePhase.FUNDED,
          profitTarget: 0,
          maxDailyLoss: toPercent(r.dailyLoss, p.size),
          maxTotalDrawdown: toPercent(r.maxDrawdown, p.size),
          drawdownType: 'static',
          minTradingDays: 0,
          maxTradingDays: null,
          consistencyRule: false,
          maxSingleDayProfit: null,
          newsRestriction: false,
          weekendRestriction: false,
        },
      ],
    };
  });
}

// =============================================================================
// Main Seed Function
// =============================================================================

async function main() {
  console.log('Seeding account types and challenge rules...\n');

  const allTypes = [
    ...buildStandardAccountTypes(),
    ...buildAdvancedAccountTypes(),
    ...buildDynastyAccountTypes(),
  ];

  for (const at of allTypes) {
    const accountType = await prisma.accountType.upsert({
      where: { name: at.name },
      update: {
        displayName: at.displayName,
        description: at.description,
        accountSize: at.accountSize,
        price: at.price,
        resetPrice: at.resetPrice,
        profitSplit: at.profitSplit,
        minPayoutAmount: at.minPayoutAmount,
        payoutFrequency: at.payoutFrequency,
        sortOrder: at.sortOrder,
        isActive: true,
      },
      create: {
        name: at.name,
        displayName: at.displayName,
        description: at.description,
        accountSize: at.accountSize,
        price: at.price,
        resetPrice: at.resetPrice,
        profitSplit: at.profitSplit,
        minPayoutAmount: at.minPayoutAmount,
        payoutFrequency: at.payoutFrequency,
        sortOrder: at.sortOrder,
        isActive: true,
      },
    });

    console.log(`  ✓ ${accountType.name} (${accountType.id})`);

    for (const rule of at.rules) {
      await prisma.challengeRule.upsert({
        where: {
          accountTypeId_phase: {
            accountTypeId: accountType.id,
            phase: rule.phase,
          },
        },
        update: {
          profitTarget: rule.profitTarget,
          maxDailyLoss: rule.maxDailyLoss,
          maxTotalDrawdown: rule.maxTotalDrawdown,
          drawdownType: rule.drawdownType,
          minTradingDays: rule.minTradingDays,
          maxTradingDays: rule.maxTradingDays,
          consistencyRule: rule.consistencyRule,
          maxSingleDayProfit: rule.maxSingleDayProfit,
          newsRestriction: rule.newsRestriction,
          weekendRestriction: rule.weekendRestriction,
        },
        create: {
          accountTypeId: accountType.id,
          phase: rule.phase,
          profitTarget: rule.profitTarget,
          maxDailyLoss: rule.maxDailyLoss,
          maxTotalDrawdown: rule.maxTotalDrawdown,
          drawdownType: rule.drawdownType,
          minTradingDays: rule.minTradingDays,
          maxTradingDays: rule.maxTradingDays,
          consistencyRule: rule.consistencyRule,
          maxSingleDayProfit: rule.maxSingleDayProfit,
          newsRestriction: rule.newsRestriction,
          weekendRestriction: rule.weekendRestriction,
        },
      });

      console.log(`      └─ ${rule.phase} rule`);
    }
  }

  console.log(`\nDone! Seeded ${allTypes.length} account types with challenge rules.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
