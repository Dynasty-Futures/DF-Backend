// =============================================================================
// Trading Platform Provider Interface
// =============================================================================
// All external trading platforms (Volumetrica, future platforms) implement this
// interface. The rest of the application codes against these operations and
// never touches platform-specific HTTP calls directly.
// =============================================================================

import type {
  CreatePlatformUserParams,
  PlatformUserCreateResult,
  PlatformUserResult,
  UpdatePlatformUserParams,
  InvitePlatformUserParams,
  PlatformInviteResult,
  CreatePlatformAccountParams,
  PlatformAccountResult,
  PlatformReportResult,
  PlatformSnapshotResult,
  PlatformTradeResult,
  IFrameType,
  PaginatedResult,
  PlatformAccountHeader,
  PlatformAccountInfo,
  PlatformBulkTrade,
  PlatformBulkFill,
  PlatformBulkOrder,
  PlatformBulkTransaction,
  PlatformBulkDailySnapshot,
  PlatformSessionLog,
  CreatePlatformTradingRuleParams,
  PlatformTradingRuleResult,
} from './types.js';

export interface TradingPlatformProvider {
  // ── User Operations ─────────────────────────────────────────────────────

  createUser(params: CreatePlatformUserParams): Promise<PlatformUserCreateResult>;

  getUser(platformUserId: string): Promise<PlatformUserResult>;

  updateUser(
    platformUserId: string,
    params: UpdatePlatformUserParams,
  ): Promise<PlatformUserCreateResult>;

  inviteUser(params: InvitePlatformUserParams): Promise<PlatformInviteResult>;

  // ── Account Operations ──────────────────────────────────────────────────

  createAccount(
    params: CreatePlatformAccountParams,
  ): Promise<PlatformAccountResult>;

  getAccount(platformAccountId: string): Promise<PlatformAccountResult>;

  getAccountsByUser(platformUserId: string): Promise<PlatformAccountResult[]>;

  enableAccount(platformAccountId: string): Promise<PlatformAccountResult>;

  disableAccount(
    platformAccountId: string,
    reason?: string,
  ): Promise<PlatformAccountResult>;

  resetAccount(platformAccountId: string): Promise<PlatformAccountResult>;

  deleteAccount(platformAccountId: string): Promise<void>;

  // ── Data Retrieval ──────────────────────────────────────────────────────

  getAccountReport(
    platformAccountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformReportResult>;

  getDailySnapshots(
    platformAccountId: string,
    startDt?: Date,
  ): Promise<PlatformSnapshotResult[]>;

  getHistoricalTrades(
    platformAccountId: string,
    startDt: Date,
    endDt?: Date,
  ): Promise<PlatformTradeResult[]>;

  // ── Login / Dashboard ─────────────────────────────────────────────────

  getLoginUrl(platformUserId: string): Promise<string>;

  getIFrameUrl(
    platformUserId: string,
    type?: IFrameType | undefined,
    accountId?: string | undefined,
  ): Promise<string>;

  // ── Trading Rule Operations ────────────────────────────────────────

  /** Create a trading rule on the platform. */
  createTradingRule(
    params: CreatePlatformTradingRuleParams,
  ): Promise<PlatformTradingRuleResult>;

  /** Get a trading rule by ID. */
  getTradingRule(ruleId: string): Promise<PlatformTradingRuleResult>;

  /** List all trading rules. */
  listTradingRules(): Promise<PlatformTradingRuleResult[]>;

  /** Assign a trading rule to an account. */
  assignTradingRule(
    platformAccountId: string,
    tradingRuleId: string,
  ): Promise<void>;

  // ── Bulk Operations ──────────────────────────────────────────────────

  /** Get all enabled accounts (from database). */
  getBulkAccountsEnabled(): Promise<PlatformAccountHeader[]>;

  /** Get real-time snapshots/info for all enabled accounts. */
  getBulkAccountsInfo(): Promise<Record<string, PlatformAccountInfo>>;

  /** Get real-time snapshots/info filtered by trading rule. */
  getBulkAccountsInfoByRule(
    ruleId: string,
  ): Promise<Record<string, PlatformAccountInfo>>;

  /** Get accounts disabled within a date range. */
  getBulkAccountsDisabled(
    startDt?: Date | undefined,
    endDt?: Date | undefined,
  ): Promise<PlatformAccountHeader[]>;

  /** Get trades executed within a date range (paginated, keyed by account ID). */
  getBulkTrades(
    startDt: Date,
    endDt?: Date | undefined,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<Record<string, PlatformBulkTrade[]>>>;

  /** Get fills executed within a date range (paginated, keyed by account ID). */
  getBulkFills(
    startDt: Date,
    endDt?: Date | undefined,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<Record<string, PlatformBulkFill[]>>>;

  /** Get orders within a date range (paginated, keyed by account ID). */
  getBulkOrders(
    startDt: Date,
    endDt?: Date | undefined,
    orderStatus?: string | undefined,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<Record<string, PlatformBulkOrder[]>>>;

  /** Get account transactions within a date range (paginated, keyed by account ID). */
  getBulkTransactions(
    startDt: Date,
    endDt?: Date | undefined,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<Record<string, PlatformBulkTransaction[]>>>;

  /** Get daily snapshots within a date range (paginated, keyed by account ID). */
  getBulkDailySnapshots(
    startDt: Date,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<Record<string, PlatformBulkDailySnapshot[]>>>;

  /** Get user session logs within a date range (paginated). */
  getBulkSessionLogs(
    startDt?: Date | undefined,
    endDt?: Date | undefined,
    platform?: string | undefined,
    nextPageToken?: string | undefined,
  ): Promise<PaginatedResult<PlatformSessionLog[]>>;
}
