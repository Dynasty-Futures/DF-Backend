import { ChallengePhase } from '@prisma/client';
import {
  mapChallengeRuleToTradingParams,
  findOrCreateTradingRule,
} from '../rule-mapping.service';

// =============================================================================
// mapChallengeRuleToTradingParams
// =============================================================================

describe('mapChallengeRuleToTradingParams', () => {
  const makeRule = (overrides = {}) => ({
    id: 'rule-001',
    phase: ChallengePhase.PHASE_1,
    profitTarget: 6.0,
    maxDailyLoss: 3.0,
    maxTotalDrawdown: 6.0,
    drawdownType: 'trailing',
    minTradingDays: 5,
    consistencyRule: true,
    maxSingleDayProfit: 50.0,
    newsRestriction: false,
    weekendRestriction: false,
    ...overrides,
  });

  it('maps Standard 25K Phase 1 correctly', () => {
    const result = mapChallengeRuleToTradingParams(makeRule(), 25000, 'STANDARD_25K');

    expect(result).toEqual({
      name: 'STANDARD_25K_PHASE_1',
      organizationReferenceId: 'rule-001',
      maxDrawdownMoney: 1500,
      maxDrawdownMode: 0, // trailing
      maxDrawdownAction: 1, // ChallengeFail
      intradayMaxDrawdownMoney: 750,
      intradayMaxDrawdownAction: 1,
      profitTargetMoney: 1500,
      profitTargetAction: 1, // ChallengeSuccess
      consistencyPercentual: 50.0,
      minSessionNumbers: 5,
    });
  });

  it('maps Standard 50K Phase 1 correctly', () => {
    // 50K: profitTarget=6%, dailyLoss=3%, maxDrawdown=5%
    const result = mapChallengeRuleToTradingParams(
      makeRule({ id: 'rule-002', maxTotalDrawdown: 5.0 }),
      50000,
      'STANDARD_50K',
    );

    expect(result.maxDrawdownMoney).toBe(2500);
    expect(result.intradayMaxDrawdownMoney).toBe(1500);
    expect(result.profitTargetMoney).toBe(3000);
  });

  it('maps funded phase with no profit target', () => {
    const result = mapChallengeRuleToTradingParams(
      makeRule({
        id: 'rule-003',
        phase: ChallengePhase.FUNDED,
        profitTarget: 0,
        drawdownType: 'static',
        minTradingDays: 0,
        consistencyRule: false,
        maxSingleDayProfit: null,
      }),
      25000,
      'STANDARD_25K',
    );

    expect(result.name).toBe('STANDARD_25K_FUNDED');
    expect(result.maxDrawdownMode).toBe(1); // static
    expect(result.profitTargetMoney).toBeUndefined();
    expect(result.profitTargetAction).toBeUndefined();
    expect(result.consistencyPercentual).toBeUndefined();
    expect(result.minSessionNumbers).toBeUndefined();
  });

  it('sets news restriction action when enabled', () => {
    const result = mapChallengeRuleToTradingParams(
      makeRule({ newsRestriction: true }),
      25000,
      'STANDARD_25K',
    );

    expect(result.newsRestrictionAction).toBe(4); // IntradayDisable
  });

  it('sets weekend restriction action when enabled', () => {
    const result = mapChallengeRuleToTradingParams(
      makeRule({ weekendRestriction: true }),
      25000,
      'STANDARD_25K',
    );

    expect(result.overweekendAction).toBe(4); // IntradayDisable
  });

  it('handles Prisma Decimal objects with toNumber()', () => {
    const decimal = (n: number) => ({ toNumber: () => n });

    const result = mapChallengeRuleToTradingParams(
      makeRule({
        profitTarget: decimal(6.0),
        maxDailyLoss: decimal(3.0),
        maxTotalDrawdown: decimal(6.0),
        maxSingleDayProfit: decimal(50.0),
      }),
      25000,
      'STANDARD_25K',
    );

    expect(result.maxDrawdownMoney).toBe(1500);
    expect(result.intradayMaxDrawdownMoney).toBe(750);
    expect(result.profitTargetMoney).toBe(1500);
    expect(result.consistencyPercentual).toBe(50.0);
  });

  it('does not set consistency when rule is false', () => {
    const result = mapChallengeRuleToTradingParams(
      makeRule({ consistencyRule: false, maxSingleDayProfit: 50.0 }),
      25000,
      'STANDARD_25K',
    );

    expect(result.consistencyPercentual).toBeUndefined();
  });

  it('maps 100K account with correct dollar amounts', () => {
    // 100K: profitTarget=6%, dailyLoss=2%, maxDrawdown=3%
    const result = mapChallengeRuleToTradingParams(
      makeRule({
        id: 'rule-100k',
        profitTarget: 6.0,
        maxDailyLoss: 2.0,
        maxTotalDrawdown: 3.0,
      }),
      100000,
      'STANDARD_100K',
    );

    expect(result.maxDrawdownMoney).toBe(3000);
    expect(result.intradayMaxDrawdownMoney).toBe(2000);
    expect(result.profitTargetMoney).toBe(6000);
  });
});

// =============================================================================
// findOrCreateTradingRule
// =============================================================================

describe('findOrCreateTradingRule', () => {
  const mockProvider = {
    listTradingRules: jest.fn(),
    createTradingRule: jest.fn(),
  };

  const params = {
    name: 'STANDARD_25K_PHASE_1',
    organizationReferenceId: 'rule-001',
    maxDrawdownMoney: 1500,
    maxDrawdownMode: 0,
    maxDrawdownAction: 1,
    intradayMaxDrawdownMoney: 750,
    intradayMaxDrawdownAction: 1,
    profitTargetMoney: 1500,
    profitTargetAction: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing rule when organizationReferenceId matches', async () => {
    mockProvider.listTradingRules.mockResolvedValue([
      { tradingRuleId: 'vol-rule-123', name: 'STANDARD_25K_PHASE_1', organizationReferenceId: 'rule-001' },
    ]);

    const result = await findOrCreateTradingRule(mockProvider as never, params);

    expect(result).toBe('vol-rule-123');
    expect(mockProvider.createTradingRule).not.toHaveBeenCalled();
  });

  it('creates a new rule when no match found', async () => {
    mockProvider.listTradingRules.mockResolvedValue([]);
    mockProvider.createTradingRule.mockResolvedValue({
      tradingRuleId: 'vol-rule-new',
      name: 'STANDARD_25K_PHASE_1',
    });

    const result = await findOrCreateTradingRule(mockProvider as never, params);

    expect(result).toBe('vol-rule-new');
    expect(mockProvider.createTradingRule).toHaveBeenCalledWith(params);
  });

  it('creates a new rule when organizationReferenceId does not match', async () => {
    mockProvider.listTradingRules.mockResolvedValue([
      { tradingRuleId: 'vol-rule-other', name: 'OTHER_RULE', organizationReferenceId: 'rule-999' },
    ]);
    mockProvider.createTradingRule.mockResolvedValue({
      tradingRuleId: 'vol-rule-new',
      name: 'STANDARD_25K_PHASE_1',
    });

    const result = await findOrCreateTradingRule(mockProvider as never, params);

    expect(result).toBe('vol-rule-new');
  });
});
