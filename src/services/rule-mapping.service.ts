import { ChallengePhase } from '@prisma/client';
import { logger } from '../utils/logger.js';
import type { CreatePlatformTradingRuleParams } from '../providers/types.js';
import type { TradingPlatformProvider } from '../providers/trading-platform.provider.js';

// =============================================================================
// Rule Mapping Service
// =============================================================================
// Converts ChallengeRule seed data (percentages) into Volumetrica-compatible
// TradingRule params (dollar amounts + enum values).
// =============================================================================

// ── Volumetrica Enum Constants ──────────────────────────────────────────────

/** DrawdownModeEnum: 0 = trailing (high-water mark), 1 = static (starting balance) */
const DRAWDOWN_MODE = { trailing: 0, static: 1 } as const;

/** RiskActionEnum: drawdown breach → fail challenge */
const DRAWDOWN_ACTION_FAIL = 1;

/** RiskIntradayActionEnum: intraday drawdown breach → fail challenge */
const INTRADAY_ACTION_FAIL = 1;

/** RiskProfitTargetActionEnum: 0 = none, 1 = challenge success */
const PROFIT_TARGET_ACTION = { none: 0, success: 1 } as const;

/** RiskInhibitActionEnum: 0 = none, 4 = intraday disable */
const INHIBIT_ACTION = { none: 0, intradayDisable: 4 } as const;

// ── Types ───────────────────────────────────────────────────────────────────

interface ChallengeRuleInput {
  id: string;
  phase: ChallengePhase;
  profitTarget: number | { toNumber(): number };
  maxDailyLoss: number | { toNumber(): number };
  maxTotalDrawdown: number | { toNumber(): number };
  drawdownType: string;
  minTradingDays: number;
  consistencyRule: boolean;
  maxSingleDayProfit: number | { toNumber(): number } | null;
  newsRestriction: boolean;
  weekendRestriction: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const toNum = (val: number | { toNumber(): number }): number =>
  typeof val === 'number' ? val : val.toNumber();

const pctToDollars = (pct: number, accountSize: number): number =>
  Math.round((pct / 100) * accountSize * 100) / 100;

// ── Core Mapping ────────────────────────────────────────────────────────────

/**
 * Maps a ChallengeRule + account size into Volumetrica CreatePlatformTradingRuleParams.
 *
 * Percentages are converted to absolute dollar amounts.
 * Booleans are converted to Volumetrica enum values.
 */
export const mapChallengeRuleToTradingParams = (
  rule: ChallengeRuleInput,
  accountSize: number,
  accountTypeName: string,
): CreatePlatformTradingRuleParams => {
  const profitTargetPct = toNum(rule.profitTarget);
  const maxDailyLossPct = toNum(rule.maxDailyLoss);
  const maxTotalDrawdownPct = toNum(rule.maxTotalDrawdown);
  const drawdownMode = rule.drawdownType === 'trailing'
    ? DRAWDOWN_MODE.trailing
    : DRAWDOWN_MODE.static;

  const params: CreatePlatformTradingRuleParams = {
    name: `${accountTypeName}_${rule.phase}`,
    organizationReferenceId: rule.id,
    maxDrawdownMoney: pctToDollars(maxTotalDrawdownPct, accountSize),
    maxDrawdownMode: drawdownMode,
    maxDrawdownAction: DRAWDOWN_ACTION_FAIL,
    intradayMaxDrawdownMoney: pctToDollars(maxDailyLossPct, accountSize),
    intradayMaxDrawdownAction: INTRADAY_ACTION_FAIL,
  };

  // Profit target — only set when > 0 (evaluation phases)
  if (profitTargetPct > 0) {
    params.profitTargetMoney = pctToDollars(profitTargetPct, accountSize);
    params.profitTargetAction = PROFIT_TARGET_ACTION.success;
  }

  // Consistency rule — use maxSingleDayProfit as the percentage cap
  if (rule.consistencyRule && rule.maxSingleDayProfit !== null && rule.maxSingleDayProfit !== undefined) {
    params.consistencyPercentual = toNum(rule.maxSingleDayProfit);
  }

  // Min trading days
  if (rule.minTradingDays > 0) {
    params.minSessionNumbers = rule.minTradingDays;
  }

  // News restriction
  if (rule.newsRestriction) {
    params.newsRestrictionAction = INHIBIT_ACTION.intradayDisable;
  }

  // Weekend restriction
  if (rule.weekendRestriction) {
    params.overweekendAction = INHIBIT_ACTION.intradayDisable;
  }

  return params;
};

// ── Find or Create ──────────────────────────────────────────────────────────

/**
 * Checks if a trading rule already exists on the platform (by organizationReferenceId).
 * Creates it if not found. Returns the tradingRuleId.
 */
export const findOrCreateTradingRule = async (
  provider: TradingPlatformProvider,
  params: CreatePlatformTradingRuleParams,
): Promise<string> => {
  // Check if rule already exists by our idempotency key
  if (params.organizationReferenceId) {
    const existing = await provider.listTradingRules();
    const match = existing.find(
      (r) => r.organizationReferenceId === params.organizationReferenceId,
    );

    if (match) {
      logger.debug(
        { tradingRuleId: match.tradingRuleId, name: params.name },
        'Found existing trading rule on platform',
      );
      return match.tradingRuleId;
    }
  }

  logger.info({ name: params.name }, 'Creating new trading rule on platform');
  const result = await provider.createTradingRule(params);
  return result.tradingRuleId;
};
