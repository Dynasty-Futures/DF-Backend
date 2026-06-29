// =============================================================================
// Payout Eligibility Engine
// =============================================================================
// A PURE, side-effect-free evaluator for "can this trader request this payout?"
//
// Design principles:
//  - YPF is the FINAL authority. This engine never approves anything; it only
//    pre-screens so we don't submit obviously-ineligible requests that YPF would
//    just reject (bad UX + CRM noise).
//  - FAIL-PERMISSIVE on missing config. A threshold that YPF didn't populate
//    (undefined, or 0 for count/amount minimums) is treated as "not configured"
//    and the rule passes. We only ever BLOCK on a threshold we actually have and
//    the account demonstrably fails. The safe failure mode is "let it through to
//    YPF" (today's behaviour), never "wrongly block a valid withdrawal".
//  - Every rule reports a structured result so the UI can explain exactly what's
//    met / unmet.
// =============================================================================

import type { AccountWithdrawalRules } from '../providers/types.js';

// ── Public shapes ─────────────────────────────────────────────────────────────

/** A single eligibility rule's outcome. */
export interface PayoutRule {
  /** Stable machine key (e.g. 'min_profitable_days'). */
  key: string;
  /** Human-readable description of what the rule requires. */
  label: string;
  /** true = satisfied (or not configured / not applicable). */
  passed: boolean;
  /** Whether this rule was actually enforced (a threshold was present). */
  enforced: boolean;
  /** Optional progress numbers for UI ("3 / 5 days"). */
  current?: number;
  required?: number;
  /** Why it failed, when it failed. */
  reason?: string;
}

export interface PayoutEligibilityInput {
  /** Local account status — 'FUNDED', 'FAILED'/'BREACHED', etc. */
  accountStatus: string;
  /** Live balance + the anchored starting balance. */
  currentBalance: number;
  startingBalance: number;
  /** Whether a payout is already in flight for this account. */
  hasPendingPayout: boolean;
  /** Whether the account is linked to the trading platform. */
  isPlatformLinked: boolean;
  /** Live day counters from YPF (undefined = unknown → permissive). */
  profitTradingDays?: number | undefined;
  activeDays?: number | undefined;
  tradingDays?: number | undefined;
  /** Trader's profit-split % (e.g. 80 = keeps 80%). */
  profitSplit?: number | undefined;
  /**
   * DF plan-level maximum payout per eligible cycle (from AccountType), in
   * dollars. Tightens the ceiling alongside YPF's own cap. Undefined/0 = not
   * configured → no plan cap applied (fail-permissive, same as YPF thresholds).
   */
  planPayoutCap?: number | undefined;
  /** Merged program + account withdrawal thresholds. */
  rules?: AccountWithdrawalRules | undefined;
  /** The amount being requested. Omit when only assessing account eligibility. */
  requestedAmount?: number | undefined;
}

export interface PayoutEligibilityResult {
  /** Account-level eligibility — can this account request *any* payout right now? */
  eligible: boolean;
  /** Per-rule breakdown (account-level rules, amount-independent). */
  rules: PayoutRule[];
  /** Withdrawable profit ceiling. */
  availableProfit: number;
  /** Minimum a single request must be (0 = no minimum). */
  minAmount: number;
  /** Maximum a single request may be (= availableProfit, capped by profit cap). */
  maxAmount: number;
  /** Net the trader receives after the profit split, for `requestedAmount`. */
  netAmount?: number | undefined;
  /** Amount-specific failures (only when `requestedAmount` is provided). */
  amountErrors: string[];
  /** First blocking reason overall — handy for a single-line API error. */
  blockingReason?: string | undefined;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FUNDED = 'FUNDED';
/** Local statuses that mean "breached / failed". */
const BREACHED_STATUSES = new Set(['FAILED', 'BREACHED', 'CLOSED']);

/** A count/amount threshold only enforces when it's a positive number. */
const isPositive = (n?: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Evaluate payout eligibility. Pure — no I/O, fully deterministic, so it's
 * exhaustively unit-testable without a live YPF account.
 */
export const evaluatePayoutEligibility = (
  input: PayoutEligibilityInput,
): PayoutEligibilityResult => {
  const rules: PayoutRule[] = [];
  const r = input.rules ?? {};

  const isBreached = BREACHED_STATUSES.has(input.accountStatus.toUpperCase());
  const isFunded = input.accountStatus.toUpperCase() === FUNDED;

  // ── Rule 1: account is fundable status ─────────────────────────────────────
  // Funded always qualifies. A breached account only qualifies if YPF's
  // addOns.allowPayoutOnBreach is explicitly true.
  const breachAllowed = r.allowPayoutOnBreach === true;
  const statusOk = isFunded || (isBreached && breachAllowed);
  rules.push({
    key: 'account_status',
    label: 'Account is funded',
    passed: statusOk,
    enforced: true,
    ...(statusOk
      ? {}
      : {
          reason: isBreached
            ? 'This account is no longer active'
            : 'Only funded accounts can request a payout',
        }),
  });

  // ── Rule 2: platform link ──────────────────────────────────────────────────
  rules.push({
    key: 'platform_linked',
    label: 'Account linked to the trading platform',
    passed: input.isPlatformLinked,
    enforced: true,
    ...(input.isPlatformLinked
      ? {}
      : { reason: 'This account is not linked to the trading platform yet' }),
  });

  // ── Rule 3: program allows withdrawals ─────────────────────────────────────
  // Only enforced when YPF explicitly says withdrawals are off.
  const withdrawalsOff = r.isWithdrawalAllowed === false;
  rules.push({
    key: 'withdrawals_allowed',
    label: 'Withdrawals enabled for this program',
    passed: !withdrawalsOff,
    enforced: r.isWithdrawalAllowed !== undefined,
    ...(withdrawalsOff
      ? { reason: 'Withdrawals are not enabled for this program' }
      : {}),
  });

  // ── Rule 4: withdrawable profit exists ─────────────────────────────────────
  const availableProfit = Math.max(
    0,
    round2(input.currentBalance - input.startingBalance),
  );
  const hasProfit = availableProfit > 0;
  rules.push({
    key: 'has_profit',
    label: 'Has withdrawable profit',
    passed: hasProfit,
    enforced: true,
    current: availableProfit,
    ...(hasProfit ? {} : { reason: 'No withdrawable profit on this account' }),
  });

  // ── Rule 5: minimum profitable trading days ────────────────────────────────
  pushMinDaysRule(
    rules,
    'min_profitable_days',
    'Minimum profitable trading days',
    input.profitTradingDays,
    r.minProfitableTradingDays,
    'profitable trading day',
  );

  // ── Rule 6: minimum active days ────────────────────────────────────────────
  pushMinDaysRule(
    rules,
    'min_active_days',
    'Minimum active days',
    input.activeDays,
    r.minActiveDays,
    'active day',
  );

  // ── Rule 7: minimum trading days ───────────────────────────────────────────
  pushMinDaysRule(
    rules,
    'min_trading_days',
    'Minimum trading days',
    input.tradingDays,
    r.minTradingDays,
    'trading day',
  );

  // ── Rule 8: no payout already in flight ────────────────────────────────────
  rules.push({
    key: 'no_pending_payout',
    label: 'No payout already in progress',
    passed: !input.hasPendingPayout,
    enforced: true,
    ...(input.hasPendingPayout
      ? { reason: 'You already have a payout request in progress' }
      : {}),
  });

  // ── Amount bounds ──────────────────────────────────────────────────────────
  const minAmount = isPositive(r.minWithdrawalAmount)
    ? round2(r.minWithdrawalAmount)
    : 0;
  // The ceiling is the withdrawable profit, tightened by whichever caps are
  // configured: YPF's per-account/program cap and DF's plan-level cap. Each is
  // fail-permissive — applied only when present and positive.
  const caps = [availableProfit];
  if (isPositive(r.maxWithdrawalAmount)) caps.push(round2(r.maxWithdrawalAmount));
  if (isPositive(input.planPayoutCap)) caps.push(round2(input.planPayoutCap));
  const maxAmount = Math.min(...caps);
  // True when a configured cap actually tightened the ceiling below available profit.
  const capApplied = maxAmount < availableProfit;

  const accountEligible = rules.every((rule) => rule.passed);

  // ── Amount-specific checks (optional) ──────────────────────────────────────
  const amountErrors: string[] = [];
  let netAmount: number | undefined;
  const amount = input.requestedAmount;
  if (amount !== undefined) {
    if (!(amount > 0)) {
      amountErrors.push('Payout amount must be greater than zero');
    } else {
      if (amount > availableProfit) {
        amountErrors.push('Requested amount exceeds your withdrawable profit');
      }
      if (minAmount > 0 && amount < minAmount) {
        amountErrors.push(
          `Minimum payout is ${minAmount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          })}`,
        );
      }
      if (capApplied && amount > maxAmount) {
        amountErrors.push(
          `Maximum payout is ${maxAmount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          })} per eligible payout cycle`,
        );
      }
    }
    // Net after the profit split, when known. A 0/undefined split means we can't
    // compute a split, so we surface the gross (no silent reduction).
    netAmount = isPositive(input.profitSplit)
      ? round2((amount * input.profitSplit) / 100)
      : round2(amount);
  }

  const firstFailedRule = rules.find((rule) => !rule.passed);
  const blockingReason =
    firstFailedRule?.reason ?? amountErrors[0] ?? undefined;

  return {
    eligible: accountEligible,
    rules,
    availableProfit,
    minAmount,
    maxAmount,
    ...(netAmount !== undefined ? { netAmount } : {}),
    amountErrors,
    ...(blockingReason !== undefined ? { blockingReason } : {}),
  };
};

/**
 * Push a "minimum N days" rule. Fail-permissive: when the threshold isn't a
 * positive number the rule is not enforced and passes. When enforced but the
 * trader's current count is unknown, we PASS (we don't have data to block on —
 * YPF will catch it) but still surface the requirement for the UI.
 */
const pushMinDaysRule = (
  out: PayoutRule[],
  key: string,
  label: string,
  current: number | undefined,
  required: number | undefined,
  unit: string,
): void => {
  if (!isPositive(required)) {
    out.push({ key, label, passed: true, enforced: false });
    return;
  }
  // Threshold present but we don't know the trader's progress → permissive pass.
  if (current === undefined) {
    out.push({ key, label, passed: true, enforced: true, required });
    return;
  }
  const passed = current >= required;
  out.push({
    key,
    label,
    passed,
    enforced: true,
    current,
    required,
    ...(passed
      ? {}
      : {
          reason: `Requires ${required} ${unit}${required === 1 ? '' : 's'} (you have ${current})`,
        }),
  });
};
