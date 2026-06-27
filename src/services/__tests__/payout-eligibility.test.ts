import {
  evaluatePayoutEligibility,
  type PayoutEligibilityInput,
} from '../payout-eligibility';

// =============================================================================
// Payout Eligibility Engine — unit tests
// =============================================================================
// Pure function, no mocks. Exercises every rule (pass/fail), the fail-permissive
// behaviour on missing config, amount bounds, and the net-after-split math.
// =============================================================================

/** A fully-eligible funded account with no special thresholds configured. */
const baseInput = (
  overrides: Partial<PayoutEligibilityInput> = {},
): PayoutEligibilityInput => ({
  accountStatus: 'FUNDED',
  currentBalance: 110_000,
  startingBalance: 100_000,
  hasPendingPayout: false,
  isPlatformLinked: true,
  ...overrides,
});

const ruleByKey = (
  result: ReturnType<typeof evaluatePayoutEligibility>,
  key: string,
) => result.rules.find((r) => r.key === key)!;

describe('evaluatePayoutEligibility', () => {
  describe('happy path', () => {
    it('a funded account with profit and no thresholds is eligible', () => {
      const result = evaluatePayoutEligibility(baseInput());
      expect(result.eligible).toBe(true);
      expect(result.availableProfit).toBe(10_000);
      expect(result.minAmount).toBe(0);
      expect(result.maxAmount).toBe(10_000);
      expect(result.blockingReason).toBeUndefined();
      expect(result.rules.every((r) => r.passed)).toBe(true);
    });
  });

  describe('account status', () => {
    it('blocks a non-funded (pending) account', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ accountStatus: 'PENDING' }),
      );
      expect(result.eligible).toBe(false);
      expect(ruleByKey(result, 'account_status').passed).toBe(false);
      expect(result.blockingReason).toMatch(/funded/i);
    });

    it('blocks a breached account by default', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ accountStatus: 'FAILED' }),
      );
      expect(result.eligible).toBe(false);
      expect(ruleByKey(result, 'account_status').passed).toBe(false);
    });

    it('allows a breached account when allowPayoutOnBreach is true', () => {
      const result = evaluatePayoutEligibility(
        baseInput({
          accountStatus: 'FAILED',
          rules: { allowPayoutOnBreach: true },
        }),
      );
      expect(ruleByKey(result, 'account_status').passed).toBe(true);
      expect(result.eligible).toBe(true);
    });
  });

  describe('platform link', () => {
    it('blocks an unlinked account', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ isPlatformLinked: false }),
      );
      expect(result.eligible).toBe(false);
      expect(ruleByKey(result, 'platform_linked').passed).toBe(false);
    });
  });

  describe('program withdrawal switch', () => {
    it('blocks when isWithdrawalAllowed is explicitly false', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ rules: { isWithdrawalAllowed: false } }),
      );
      expect(result.eligible).toBe(false);
      const rule = ruleByKey(result, 'withdrawals_allowed');
      expect(rule.passed).toBe(false);
      expect(rule.enforced).toBe(true);
    });

    it('passes (unenforced) when isWithdrawalAllowed is undefined', () => {
      const result = evaluatePayoutEligibility(baseInput());
      const rule = ruleByKey(result, 'withdrawals_allowed');
      expect(rule.passed).toBe(true);
      expect(rule.enforced).toBe(false);
    });

    it('passes (enforced) when isWithdrawalAllowed is true', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ rules: { isWithdrawalAllowed: true } }),
      );
      const rule = ruleByKey(result, 'withdrawals_allowed');
      expect(rule.passed).toBe(true);
      expect(rule.enforced).toBe(true);
    });
  });

  describe('has profit', () => {
    it('blocks when balance is at or below starting', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ currentBalance: 100_000 }),
      );
      expect(result.eligible).toBe(false);
      expect(ruleByKey(result, 'has_profit').passed).toBe(false);
      expect(result.availableProfit).toBe(0);
    });
  });

  describe('minimum profitable trading days (fail-permissive)', () => {
    it('is not enforced when the threshold is absent', () => {
      const rule = ruleByKey(evaluatePayoutEligibility(baseInput()), 'min_profitable_days');
      expect(rule.enforced).toBe(false);
      expect(rule.passed).toBe(true);
    });

    it('is not enforced when the threshold is zero', () => {
      const rule = ruleByKey(
        evaluatePayoutEligibility(
          baseInput({ rules: { minProfitableTradingDays: 0 } }),
        ),
        'min_profitable_days',
      );
      expect(rule.enforced).toBe(false);
      expect(rule.passed).toBe(true);
    });

    it('blocks when current days fall short of the requirement', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ profitTradingDays: 3, rules: { minProfitableTradingDays: 5 } }),
      );
      const rule = ruleByKey(result, 'min_profitable_days');
      expect(rule.passed).toBe(false);
      expect(rule.current).toBe(3);
      expect(rule.required).toBe(5);
      expect(result.eligible).toBe(false);
      expect(result.blockingReason).toMatch(/5 profitable trading days/i);
    });

    it('passes when current days meet the requirement', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ profitTradingDays: 5, rules: { minProfitableTradingDays: 5 } }),
      );
      expect(ruleByKey(result, 'min_profitable_days').passed).toBe(true);
      expect(result.eligible).toBe(true);
    });

    it('passes permissively when the threshold is set but progress is unknown', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ profitTradingDays: undefined, rules: { minProfitableTradingDays: 5 } }),
      );
      const rule = ruleByKey(result, 'min_profitable_days');
      expect(rule.enforced).toBe(true);
      expect(rule.passed).toBe(true);
      expect(rule.required).toBe(5);
    });
  });

  describe('minimum active / trading days', () => {
    it('blocks on active days shortfall', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ activeDays: 1, rules: { minActiveDays: 3 } }),
      );
      expect(ruleByKey(result, 'min_active_days').passed).toBe(false);
      expect(result.eligible).toBe(false);
    });

    it('blocks on trading days shortfall', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ tradingDays: 2, rules: { minTradingDays: 5 } }),
      );
      expect(ruleByKey(result, 'min_trading_days').passed).toBe(false);
    });
  });

  describe('pending payout', () => {
    it('blocks when one is already in flight', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ hasPendingPayout: true }),
      );
      expect(result.eligible).toBe(false);
      expect(ruleByKey(result, 'no_pending_payout').passed).toBe(false);
    });
  });

  describe('amount bounds', () => {
    it('derives min/max from thresholds, capping max at available profit', () => {
      const result = evaluatePayoutEligibility(
        baseInput({
          rules: { minWithdrawalAmount: 500, maxWithdrawalAmount: 8_000 },
        }),
      );
      expect(result.minAmount).toBe(500);
      expect(result.maxAmount).toBe(8_000);
    });

    it('max defaults to available profit when no cap is set', () => {
      const result = evaluatePayoutEligibility(baseInput());
      expect(result.maxAmount).toBe(result.availableProfit);
    });

    it('rejects an amount above available profit', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 20_000 }),
      );
      expect(result.amountErrors).toContain(
        'Requested amount exceeds your withdrawable profit',
      );
      expect(result.blockingReason).toMatch(/exceeds/i);
    });

    it('rejects an amount below the configured minimum', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 100, rules: { minWithdrawalAmount: 500 } }),
      );
      expect(result.amountErrors.some((e) => /Minimum payout/i.test(e))).toBe(true);
    });

    it('rejects an amount above the profit cap', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 9_000, rules: { maxWithdrawalAmount: 8_000 } }),
      );
      expect(result.amountErrors.some((e) => /Maximum payout/i.test(e))).toBe(true);
    });

    it('rejects a zero / negative amount', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 0 }),
      );
      expect(result.amountErrors).toContain(
        'Payout amount must be greater than zero',
      );
    });

    it('accepts a valid amount within bounds', () => {
      const result = evaluatePayoutEligibility(
        baseInput({
          requestedAmount: 2_000,
          rules: { minWithdrawalAmount: 500, maxWithdrawalAmount: 8_000 },
        }),
      );
      expect(result.amountErrors).toHaveLength(0);
    });
  });

  describe('net-after-split math', () => {
    it('applies the profit split to the requested amount', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 1_000, profitSplit: 80 }),
      );
      expect(result.netAmount).toBe(800);
    });

    it('returns the gross when no split is configured', () => {
      const result = evaluatePayoutEligibility(
        baseInput({ requestedAmount: 1_000 }),
      );
      expect(result.netAmount).toBe(1_000);
    });

    it('omits netAmount when no amount is requested', () => {
      const result = evaluatePayoutEligibility(baseInput());
      expect(result.netAmount).toBeUndefined();
    });
  });

  describe('multiple failures', () => {
    it('surfaces the first failing rule as the blocking reason', () => {
      const result = evaluatePayoutEligibility(
        baseInput({
          accountStatus: 'PENDING',
          isPlatformLinked: false,
        }),
      );
      // account_status comes before platform_linked in evaluation order.
      expect(result.blockingReason).toMatch(/funded/i);
      expect(result.eligible).toBe(false);
    });
  });
});
