// =============================================================================
// YPF (YourPropFirm) Trading Platform Provider
// =============================================================================
// Implements TradingPlatformProvider against YPF Client API v1.
// URL shape: nested `/users/{userId}/accounts/{accountId}` resources.
// =============================================================================

import { YPFClient } from './ypf.client.js';
import { logger } from '../../utils/logger.js';
import type { TradingPlatformProvider } from '../trading-platform.provider.js';
import type {
  CreatePlatformUserParams,
  PlatformUserResult,
  CreatePlatformAccountParams,
  PlatformAccountResult,
  PlatformSnapshotResult,
  PlatformTradeResult,
  PlatformBreachResult,
  PlatformProgramResult,
  CreatePlatformPayoutParams,
  PlatformPayoutResult,
  ListPayoutsParams,
  ListProgramsParams,
  AccountWithdrawalRules,
} from '../types.js';

// ── YPF raw response shapes (subset — only fields we map) ───────────────────

// NOTE: YPF returns extraValues entries with LOWERCASE `key`/`value` keys —
// e.g. { key: "VolumetricaUserId", value: "..." }. (The OpenAPI doc capitalised
// them, which is wrong.) Reading `entry.Key` yields undefined and silently
// drops every extraValue — that broke VolumetricaUserId capture and the trade
// embed. Match the wire format exactly.
interface YPFExtraValueEntry {
  key: string;
  value: string;
}

interface YPFAccountResponse {
  id: string;
  userId: string;
  programId?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  createdAt?: string;
  updatedAt?: string;
  tradeServer?: string;
  login?: string;
  password?: string;
  initialBalance?: number;
  balance?: number;
  equity?: number;
  drawDown?: number;
  maxDrawDown?: number;
  state?: string;
  currency?: string;
  programName?: string;
  nextProgramName?: string;
  tradingDays?: number;
  profitTradingDays?: number;
  withdrawProfitTradingDays?: number;
  activeDays?: number;
  profitSplit?: number;
  extraValues?: YPFExtraValueEntry[];
}

// YPF's `account.addOns` carries the per-account withdrawal-rule thresholds.
// All nullable — absent/zero means "not configured" downstream.
interface YPFAddOnsDetails {
  profitSplit?: number;
  withdrawActiveDays?: number;
  withdrawTradingDays?: number;
  withdrawProfitableTradingDays?: number;
  withdrawLowestAllowedWithdrawal?: number;
  withdrawProfitCapLimit?: number;
  allowPayoutOnBreach?: boolean;
}

// `/rulesdetails` returns a far richer `account` object than the plain account
// GET — notably the live day-counters + profit split + addOns that the dashboard
// tiles and payout eligibility need. We only type the subset we surface.
interface YPFRulesDetailsResponse {
  account?: {
    state?: string;
    tradingDays?: number;
    profitTradingDays?: number;
    withdrawProfitTradingDays?: number;
    activeDays?: number;
    profitSplit?: number;
    addOns?: YPFAddOnsDetails;
  };
}

interface YPFUserResponse {
  id: string;
  email?: string;
  state?: string;
  type?: string;
  kycStatus?: string;
  accountId?: string;
  createdAt?: string;
  updateAt?: string;
  profile?: {
    firstname?: string;
    lastname?: string;
    phone?: string;
    address?: string;
    zipCode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface YPFBreachResponse {
  timestamp: string;
  ruleId?: string;
  ruleName: string;
  ruleValue?: { value?: number; threshold?: number };
  reasoning?: { reason?: string; raw?: unknown };
  isSoftBreach?: boolean;
}

interface YPFProgramResponse {
  id: string;
  name: string;
  description?: string;
  currency: string;
  initialBalance: number;
  nextProgramId?: string;
  isEnabled?: boolean;
  isWithdrawalAllowed?: boolean;
  lowestAllowedWithdraw?: number;
  createdAt?: string;
}

interface YPFPayoutResponse {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  currency: string;
  /** PayoutState enum: 'Pending' | 'Approved' | 'Rejected' */
  state?: string;
  /** TransferType the payout was requested with */
  type?: string;
  commission?: number;
  profitSplit?: number;
  transferAmount?: number;
  rejectionReason?: string | null;
  stateTimestamp?: string;
  createdAt?: string;
  updatedAt?: string;
}

// `/payouts` is paginated. v1 returns `{count, continuationToken, results}`;
// v2 returns `{total, offset, limit, results}`. Both carry `.results`.
type YPFPayoutsListResponse =
  | YPFPayoutResponse[]
  | {
      results?: YPFPayoutResponse[];
      count?: number;
      total?: number;
      continuationToken?: string;
    };

/** Cached per-program info used to enrich live account fetches. */
interface ProgramCacheEntry {
  name: string;
  nextProgramId?: string;
  isWithdrawalAllowed?: boolean;
  lowestAllowedWithdraw?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const toDate = (s?: string): Date | undefined => (s ? new Date(s) : undefined);

const flattenExtraValues = (
  arr?: YPFExtraValueEntry[],
): Record<string, string> | undefined => {
  if (!arr || arr.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const entry of arr) {
    if (entry?.key) out[entry.key] = entry.value ?? '';
  }
  return out;
};

const mapAccount = (a: YPFAccountResponse): PlatformAccountResult => {
  const result: PlatformAccountResult = {
    platformAccountId: a.id,
    platformUserId: a.userId,
    accountName: a.email ?? a.id,
    status: a.state ?? 'Unknown',
    balance: a.balance ?? 0,
    // YPF returns initialBalance separately from the live balance; fall back to
    // balance only when initialBalance is absent.
    startingBalance: a.initialBalance ?? a.balance ?? 0,
    currency: a.currency ?? 'USD',
  };
  if (a.programId !== undefined) result.programId = a.programId;
  if (a.email !== undefined) result.email = a.email;
  if (a.equity !== undefined) result.equity = a.equity;
  if (a.drawDown !== undefined) result.drawDown = a.drawDown;
  if (a.maxDrawDown !== undefined) result.maxDrawDown = a.maxDrawDown;
  if (a.programName !== undefined) result.programName = a.programName;
  if (a.nextProgramName !== undefined) result.nextProgramName = a.nextProgramName;
  if (a.tradingDays !== undefined) result.tradingDays = a.tradingDays;
  if (a.profitTradingDays !== undefined)
    result.profitTradingDays = a.profitTradingDays;
  if (a.withdrawProfitTradingDays !== undefined)
    result.withdrawProfitTradingDays = a.withdrawProfitTradingDays;
  if (a.activeDays !== undefined) result.activeDays = a.activeDays;
  if (a.profitSplit !== undefined) result.profitSplit = a.profitSplit;
  // The trading platform's "Login ID" is the trader's EMAIL (what the hosted
  // Volumetrica portal prompts for), not YPF's internal account login id. Fall
  // back to a.login only when the account has no email.
  const platformLogin = a.email ?? a.login;
  if (platformLogin && a.password) {
    result.loginCredentials = { login: platformLogin, password: a.password };
  }
  const extras = flattenExtraValues(a.extraValues);
  if (extras) result.extraValues = extras;
  const created = toDate(a.createdAt);
  if (created) result.createdAt = created;
  const updated = toDate(a.updatedAt);
  if (updated) result.updatedAt = updated;
  return result;
};

const mapUser = (u: YPFUserResponse): PlatformUserResult => {
  const result: PlatformUserResult = {
    platformUserId: u.id,
  };
  if (u.email !== undefined) result.email = u.email;
  if (u.profile?.firstname !== undefined) result.firstName = u.profile.firstname;
  if (u.profile?.lastname !== undefined) result.lastName = u.profile.lastname;
  if (u.profile?.phone !== undefined) result.phone = u.profile.phone;
  if (u.profile?.address !== undefined) result.address = u.profile.address;
  if (u.profile?.zipCode !== undefined) result.postalCode = u.profile.zipCode;
  if (u.profile?.city !== undefined) result.city = u.profile.city;
  if (u.profile?.state !== undefined) result.state = u.profile.state;
  if (u.profile?.country !== undefined) result.country = u.profile.country;
  const created = toDate(u.createdAt);
  if (created) result.createdAt = created;
  const updated = toDate(u.updateAt);
  if (updated) result.updatedAt = updated;
  return result;
};

const mapBreach = (
  b: YPFBreachResponse,
  platformAccountId: string,
): PlatformBreachResult => {
  const result: PlatformBreachResult = {
    platformAccountId,
    ruleName: b.ruleName,
    severity: b.isSoftBreach ? 'soft' : 'hard',
    reason: b.reasoning?.reason ?? b.ruleName,
    occurredAt: new Date(b.timestamp),
  };
  if (b.ruleValue?.value !== undefined) result.triggeredValue = b.ruleValue.value;
  if (b.ruleValue?.threshold !== undefined)
    result.thresholdValue = b.ruleValue.threshold;
  if (b.reasoning) result.raw = b.reasoning as Record<string, unknown>;
  return result;
};

const mapProgram = (p: YPFProgramResponse): PlatformProgramResult => {
  const result: PlatformProgramResult = {
    programId: p.id,
    name: p.name,
    initialBalance: p.initialBalance,
    currency: p.currency,
    raw: p as unknown as Record<string, unknown>,
  };
  if (p.nextProgramId !== undefined) result.nextProgramId = p.nextProgramId;
  if (p.isWithdrawalAllowed !== undefined)
    result.isWithdrawalAllowed = p.isWithdrawalAllowed;
  if (p.lowestAllowedWithdraw !== undefined)
    result.lowestAllowedWithdraw = p.lowestAllowedWithdraw;
  return result;
};

/**
 * Map YPF's `account.addOns` into our neutral withdrawal-rule shape. Returns
 * undefined when there's nothing meaningful to surface so callers can skip it.
 */
const mapWithdrawalRules = (
  addOns?: YPFAddOnsDetails,
): AccountWithdrawalRules | undefined => {
  if (!addOns) return undefined;
  const r: AccountWithdrawalRules = {};
  if (addOns.withdrawProfitableTradingDays !== undefined)
    r.minProfitableTradingDays = addOns.withdrawProfitableTradingDays;
  if (addOns.withdrawActiveDays !== undefined)
    r.minActiveDays = addOns.withdrawActiveDays;
  if (addOns.withdrawTradingDays !== undefined)
    r.minTradingDays = addOns.withdrawTradingDays;
  if (addOns.withdrawLowestAllowedWithdrawal !== undefined)
    r.minWithdrawalAmount = addOns.withdrawLowestAllowedWithdrawal;
  if (addOns.withdrawProfitCapLimit !== undefined)
    r.maxWithdrawalAmount = addOns.withdrawProfitCapLimit;
  if (addOns.allowPayoutOnBreach !== undefined)
    r.allowPayoutOnBreach = addOns.allowPayoutOnBreach;
  return Object.keys(r).length > 0 ? r : undefined;
};

const mapPayout = (p: YPFPayoutResponse): PlatformPayoutResult => {
  const result: PlatformPayoutResult = {
    platformPayoutId: p.id,
    platformUserId: p.userId,
    platformAccountId: p.accountId,
    amount: p.amount,
    currency: p.currency,
    status: p.state ?? 'Pending',
    method: p.type ?? 'unknown',
  };
  if (p.profitSplit !== undefined) result.profitSplit = p.profitSplit;
  if (p.commission !== undefined) result.commission = p.commission;
  if (p.transferAmount !== undefined) result.transferAmount = p.transferAmount;
  if (p.rejectionReason) result.rejectionReason = p.rejectionReason;
  const created = toDate(p.createdAt);
  if (created) result.createdAt = created;
  // YPF reports the last state change via `stateTimestamp`; fall back to updatedAt.
  const updated = toDate(p.stateTimestamp ?? p.updatedAt);
  if (updated) result.updatedAt = updated;
  return result;
};

// ── Provider ───────────────────────────────────────────────────────────────

export class YPFProvider implements TradingPlatformProvider {
  private readonly client: YPFClient;

  // Program id → display name + withdrawal flags, cached: programs change rarely
  // and resolving them per live-account fetch would otherwise be N calls.
  private programNameCache: Map<string, ProgramCacheEntry> | null = null;
  private programCacheAt = 0;
  private static readonly PROGRAM_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(client?: YPFClient) {
    this.client = client ?? new YPFClient();
  }

  // ── User ─────────────────────────────────────────────────────────────────

  async createUser(params: CreatePlatformUserParams): Promise<PlatformUserResult> {
    // YPF's POST /users mandates programId + mtVersion even for register-only
    // creation. With isRegisterUserOnly the program is NOT provisioned into an
    // account — it only satisfies request validation.
    if (!params.programId) {
      throw new Error(
        'YPF createUser requires a programId (POST /users mandates it even for register-only)',
      );
    }
    const body: Record<string, unknown> = {
      email: params.email,
      firstname: params.firstName,
      lastname: params.lastName,
      country: params.country,
      programId: params.programId,
      mtVersion: params.tradeServer ?? 'Volumetrica',
      isRegisterUserOnly: true,
    };
    if (params.phone !== undefined) body['phone'] = params.phone;
    if (params.address !== undefined) body['addressLine'] = params.address;
    if (params.postalCode !== undefined) body['zipCode'] = params.postalCode;
    if (params.city !== undefined) body['city'] = params.city;
    if (params.language !== undefined) body['language'] = params.language;
    // Stamp our DF user id as the platform's external entity id — the dedup key
    // YPF can use to reconcile a later WooCommerce purchase onto this user.
    if (params.externalId !== undefined) body['extEntityId'] = params.externalId;

    const res = await this.client.post<YPFUserResponse>('/users', body);
    return mapUser(res);
  }

  async getUser(platformUserId: string): Promise<PlatformUserResult> {
    const res = await this.client.get<YPFUserResponse>(
      `/users/${encodeURIComponent(platformUserId)}`,
    );
    return mapUser(res);
  }

  // ── Account Lifecycle ────────────────────────────────────────────────────

  async createAccount(
    params: CreatePlatformAccountParams,
  ): Promise<PlatformAccountResult> {
    if (!params.programId) {
      throw new Error('YPF createAccount requires programId');
    }
    const body: Record<string, unknown> = {
      programId: params.programId,
    };
    if (params.currency !== undefined) body['currency'] = params.currency;
    if (params.tradeServer !== undefined) body['mtVersion'] = params.tradeServer;

    const res = await this.client.post<YPFAccountResponse>(
      `/users/${encodeURIComponent(params.platformUserId)}/accounts`,
      body,
    );
    return mapAccount(res);
  }

  async getAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult> {
    const res = await this.client.get<YPFAccountResponse>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}`,
    );
    const result = mapAccount(res);
    await this.enrichLiveAccount(
      platformUserId,
      platformAccountId,
      result,
      res.programId,
    );
    return result;
  }

  /**
   * The plain account GET omits live day-counters, profit split, and program
   * display names. Backfill them from `/rulesdetails` + the program catalog so
   * the dashboard's Account Details tiles render real values. Best-effort: a
   * failed enrichment never fails the base account fetch.
   */
  private async enrichLiveAccount(
    platformUserId: string,
    platformAccountId: string,
    result: PlatformAccountResult,
    programId?: string,
  ): Promise<void> {
    // Day-counters + profit split from /rulesdetails
    try {
      const rd = await this.client.get<YPFRulesDetailsResponse>(
        `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/rulesdetails`,
      );
      const a = rd?.account;
      if (a) {
        if (a.tradingDays !== undefined) result.tradingDays = a.tradingDays;
        if (a.profitTradingDays !== undefined)
          result.profitTradingDays = a.profitTradingDays;
        if (a.withdrawProfitTradingDays !== undefined)
          result.withdrawProfitTradingDays = a.withdrawProfitTradingDays;
        if (a.activeDays !== undefined) result.activeDays = a.activeDays;
        if (a.profitSplit !== undefined) result.profitSplit = a.profitSplit;
        const rules = mapWithdrawalRules(a.addOns);
        if (rules) result.withdrawalRules = rules;
      }
    } catch (err) {
      logger.warn(
        { err, platformAccountId },
        'YPF: failed to enrich account from rulesdetails',
      );
    }

    // Program display names (current + next phase) + program-level withdrawal
    // flags from the program catalog.
    if (programId) {
      try {
        const programs = await this.getProgramNameMap();
        const info = programs.get(programId);
        if (info?.name) result.programName = info.name;
        if (info?.nextProgramId) {
          const nextName = programs.get(info.nextProgramId)?.name;
          if (nextName) result.nextProgramName = nextName;
        }
        if (
          info &&
          (info.isWithdrawalAllowed !== undefined ||
            info.lowestAllowedWithdraw !== undefined)
        ) {
          const rules: AccountWithdrawalRules = { ...result.withdrawalRules };
          if (info.isWithdrawalAllowed !== undefined)
            rules.isWithdrawalAllowed = info.isWithdrawalAllowed;
          // The effective floor is the larger of the program + per-account mins.
          if (info.lowestAllowedWithdraw !== undefined) {
            rules.minWithdrawalAmount = Math.max(
              rules.minWithdrawalAmount ?? 0,
              info.lowestAllowedWithdraw,
            );
          }
          result.withdrawalRules = rules;
        }
      } catch (err) {
        logger.warn(
          { err, programId },
          'YPF: failed to resolve program display names',
        );
      }
    }
  }

  /** Cached program id → display name + withdrawal flags lookup. */
  private async getProgramNameMap(): Promise<Map<string, ProgramCacheEntry>> {
    const now = Date.now();
    if (
      this.programNameCache &&
      now - this.programCacheAt < YPFProvider.PROGRAM_CACHE_TTL_MS
    ) {
      return this.programNameCache;
    }
    const programs = await this.listPrograms();
    const map = new Map<string, ProgramCacheEntry>();
    for (const p of programs) {
      map.set(p.programId, {
        name: p.name,
        ...(p.nextProgramId !== undefined && { nextProgramId: p.nextProgramId }),
        ...(p.isWithdrawalAllowed !== undefined && {
          isWithdrawalAllowed: p.isWithdrawalAllowed,
        }),
        ...(p.lowestAllowedWithdraw !== undefined && {
          lowestAllowedWithdraw: p.lowestAllowedWithdraw,
        }),
      });
    }
    this.programNameCache = map;
    this.programCacheAt = now;
    return map;
  }

  async listUserAccounts(platformUserId: string): Promise<PlatformAccountResult[]> {
    const res = await this.client.get<YPFAccountResponse[]>(
      `/users/${encodeURIComponent(platformUserId)}/accounts`,
    );
    return (res ?? []).map(mapAccount);
  }

  async blockAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<void> {
    await this.client.del<void>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}`,
    );
  }

  async resetAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult> {
    const res = await this.client.post<YPFAccountResponse>(
      `/users/${encodeURIComponent(platformUserId)}/checkout-reset/${encodeURIComponent(platformAccountId)}`,
    );
    return mapAccount(res);
  }

  async reactivateAccount(
    platformUserId: string,
    platformAccountId: string,
    balanceSource?: 'initial' | 'last',
  ): Promise<PlatformAccountResult> {
    const body: Record<string, unknown> = {};
    if (balanceSource !== undefined) body['balanceSource'] = balanceSource;
    const res = await this.client.put<YPFAccountResponse>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/reactivate`,
      body,
    );
    return mapAccount(res);
  }

  async manualBreachAccount(
    platformUserId: string,
    platformAccountId: string,
    ruleName: string,
    reason?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = { ruleName };
    if (reason !== undefined) body['reason'] = reason;
    await this.client.put<void>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/manualbreach`,
      body,
    );
  }

  async manualUpgradeAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult> {
    const res = await this.client.put<YPFAccountResponse>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/manualupgrade`,
    );
    return mapAccount(res);
  }

  async updateAccountBalance(
    platformUserId: string,
    platformAccountId: string,
    amount: number,
  ): Promise<void> {
    await this.client.put<void>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/balance`,
      { amount },
    );
  }

  // ── Data Retrieval ──────────────────────────────────────────────────────

  async getDailySnapshots(
    platformUserId: string,
    platformAccountId: string,
    startDt?: Date,
  ): Promise<PlatformSnapshotResult[]> {
    const query: Record<string, string> = {};
    if (startDt) query['startDate'] = startDt.toISOString();
    const res = await this.client.get<
      Array<{
        date: string;
        openBalance?: number;
        closeBalance?: number;
        highBalance?: number;
        lowBalance?: number;
        dailyPnl?: number;
        totalPnl?: number;
        dailyDrawdown?: number;
        currentDrawdown?: number;
        tradesCount?: number;
        winningTrades?: number;
        losingTrades?: number;
      }>
    >(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/dailydrawdown`,
      query,
    );
    return (res ?? []).map((s) => ({
      platformAccountId,
      date: new Date(s.date),
      openBalance: s.openBalance ?? 0,
      closeBalance: s.closeBalance ?? 0,
      highBalance: s.highBalance ?? 0,
      lowBalance: s.lowBalance ?? 0,
      dailyPnl: s.dailyPnl ?? 0,
      totalPnl: s.totalPnl ?? 0,
      dailyDrawdown: s.dailyDrawdown ?? 0,
      currentDrawdown: s.currentDrawdown ?? 0,
      tradesCount: s.tradesCount ?? 0,
      winningTrades: s.winningTrades ?? 0,
      losingTrades: s.losingTrades ?? 0,
    }));
  }

  async getHistoricalTrades(
    platformUserId: string,
    platformAccountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformTradeResult[]> {
    const query: Record<string, string> = { startDate: startDt.toISOString() };
    if (endDt) query['endDate'] = endDt.toISOString();
    // YPF /history field names differ from our DTO: tradeSymbol/command/volume/
    // openPrice/closePrice/profit/openTime/closeTime (command is 'Buy'|'Sell').
    const res = await this.client.get<
      Array<{
        id: string;
        tradeSymbol?: string;
        command?: string;
        volume?: number;
        openPrice?: number;
        closePrice?: number;
        profit?: number;
        commission?: number;
        openTime: string;
        closeTime?: string;
        state?: string;
      }>
    >(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/history`,
      query,
    );
    return (res ?? []).map((t) => {
      const trade: PlatformTradeResult = {
        externalId: t.id,
        platformAccountId,
        symbol: t.tradeSymbol ?? '',
        side: t.command?.toLowerCase() === 'sell' ? 'SELL' : 'BUY',
        quantity: t.volume ?? 0,
        entryPrice: t.openPrice ?? 0,
        commission: t.commission ?? 0,
        entryTime: new Date(t.openTime),
      };
      if (t.closePrice !== undefined) trade.exitPrice = t.closePrice;
      if (t.profit !== undefined) trade.realizedPnl = t.profit;
      if (t.closeTime) trade.exitTime = new Date(t.closeTime);
      return trade;
    });
  }

  // ── Breaches ────────────────────────────────────────────────────────────

  async getAccountBreaches(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformBreachResult[]> {
    const res = await this.client.get<YPFBreachResponse[]>(
      `/users/${encodeURIComponent(platformUserId)}/accounts/${encodeURIComponent(platformAccountId)}/breaches`,
    );
    return (res ?? []).map((b) => mapBreach(b, platformAccountId));
  }

  async getTenantBreaches(
    platformAccountIds: string[],
    startDt?: Date,
    endDt?: Date,
  ): Promise<PlatformBreachResult[]> {
    const query: Record<string, string> = {};
    if (platformAccountIds.length > 0) {
      query['accountIds'] = platformAccountIds.join(',');
    }
    if (startDt) query['startDate'] = startDt.toISOString();
    if (endDt) query['endDate'] = endDt.toISOString();
    const res = await this.client.get<
      Array<YPFBreachResponse & { accountId: string }>
    >('/tenant/breaches', query);
    return (res ?? []).map((b) => mapBreach(b, b.accountId));
  }

  // ── Tenant-wide ─────────────────────────────────────────────────────────

  async listTenantAccounts(status?: string): Promise<PlatformAccountResult[]> {
    const res =
      status !== undefined
        ? await this.client.get<YPFAccountResponse[]>('/tenant/accounts', {
            status,
          })
        : await this.client.get<YPFAccountResponse[]>('/tenant/accounts');
    return (res ?? []).map(mapAccount);
  }

  // ── Programs ────────────────────────────────────────────────────────────

  async getProgram(programId: string): Promise<PlatformProgramResult> {
    const res = await this.client.get<YPFProgramResponse>(
      `/programs/${encodeURIComponent(programId)}`,
    );
    return mapProgram(res);
  }

  async listPrograms(
    params?: ListProgramsParams,
  ): Promise<PlatformProgramResult[]> {
    const query: Record<string, string> = {};
    if (params?.name) query['name'] = params.name;
    const res = await this.client.get<YPFProgramResponse[]>('/programs', query);
    return (res ?? []).map(mapProgram);
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async createPayout(
    platformUserId: string,
    params: CreatePlatformPayoutParams,
  ): Promise<PlatformPayoutResult> {
    // YPF's CreatePayoutRequest expects { type, amount, accountId, payoutDetails }.
    // `type` is the TransferType (e.g. 'Rise'); currency travels inside payoutDetails.
    const body: Record<string, unknown> = {
      type: params.method,
      amount: params.amount,
      accountId: params.platformAccountId,
    };
    if (params.payoutDetails !== undefined) {
      body['payoutDetails'] = params.payoutDetails;
    }
    const res = await this.client.post<YPFPayoutResponse>(
      `/users/${encodeURIComponent(platformUserId)}/payouts`,
      body,
    );
    return mapPayout(res);
  }

  async listPayouts(params?: ListPayoutsParams): Promise<PlatformPayoutResult[]> {
    const query: Record<string, string> = {};
    if (params?.platformUserId) query['userId'] = params.platformUserId;
    if (params?.platformAccountId) query['accountId'] = params.platformAccountId;
    if (params?.status) query['status'] = params.status;
    if (params?.pageToken) query['pageToken'] = params.pageToken;
    // NOTE: unlike /tenant/accounts and /programs (bare arrays), /payouts wraps
    // its rows in a paginated envelope: v1 `{count, continuationToken, results}`,
    // v2 `{total, offset, limit, results}`. Both expose `.results`, so reading it
    // is correct for either API version (and forward-compatible if we flip to v2).
    const res = await this.client.get<YPFPayoutsListResponse>('/payouts', query);
    const rows = Array.isArray(res) ? res : (res?.results ?? []);
    return rows.map(mapPayout);
  }

  async approvePayout(platformPayoutId: string): Promise<void> {
    await this.client.put<void>(
      `/payouts/${encodeURIComponent(platformPayoutId)}/approve`,
    );
  }

  async rejectPayout(platformPayoutId: string, reason?: string): Promise<void> {
    const body: Record<string, unknown> = {};
    if (reason !== undefined) body['reason'] = reason;
    await this.client.put<void>(
      `/payouts/${encodeURIComponent(platformPayoutId)}/reject`,
      body,
    );
  }
}
