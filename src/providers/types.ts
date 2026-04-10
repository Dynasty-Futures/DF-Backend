// =============================================================================
// Platform-Agnostic Trading Provider Types
// =============================================================================
// These DTOs decouple the rest of the app from any specific trading platform's
// API schema. Services and routes only work with these types.
// =============================================================================

// ── User ────────────────────────────────────────────────────────────────────

export interface CreatePlatformUserParams {
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  birthday?: Date | undefined;
  language?: string | undefined;
  /** Your internal user ID — stored as extEntityId on the platform */
  externalId?: string | undefined;
}

export interface UpdatePlatformUserParams {
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  country?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  birthday?: Date | undefined;
  language?: string | undefined;
}

export interface InvitePlatformUserParams {
  country: string;
  email?: string | undefined;
  /** Your internal user ID — prevents duplicate invitations */
  externalId?: string | undefined;
}

/** Returned after POST /User (create) or PUT /User (update). */
export interface PlatformUserCreateResult {
  platformUserId: string;
  username?: string | undefined;
}

/** Returned after GET /User — the full user profile view. */
export interface PlatformUserResult {
  platformUserId: string;
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  userName?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
  birthday?: Date | undefined;
  organizationStatus?: number | undefined;
  webAccessDisabled?: boolean | undefined;
  extEntityId?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface PlatformInviteResult {
  platformUserId: string;
  status: number;
  inviteUrl?: string | undefined;
  externalId?: string | undefined;
  inviteId?: string | undefined;
}

// ── Account ─────────────────────────────────────────────────────────────────

export interface CreatePlatformAccountParams {
  platformUserId: string;
  accountName: string;
  startingBalance: number;
  /** Platform-specific account group / template ID */
  groupId?: string | undefined;
  currency?: string | undefined;
}

export interface PlatformAccountResult {
  platformAccountId: string;
  platformUserId: string;
  accountName: string;
  status: string;
  balance: number;
  equity?: number | undefined;
  openPnl?: number | undefined;
  margin?: number | undefined;
  startingBalance: number;
  currency: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

// ── Report ──────────────────────────────────────────────────────────────────

export interface PlatformReportResult {
  platformAccountId: string;
  startDate: Date;
  endDate: Date;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio?: number | undefined;
  bestDay?: number | undefined;
  worstDay?: number | undefined;
  raw?: Record<string, unknown> | undefined;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

export interface PlatformSnapshotResult {
  platformAccountId: string;
  date: Date;
  openBalance: number;
  closeBalance: number;
  highBalance: number;
  lowBalance: number;
  dailyPnl: number;
  totalPnl: number;
  dailyDrawdown: number;
  currentDrawdown: number;
  tradesCount: number;
  winningTrades: number;
  losingTrades: number;
}

// ── Trades ──────────────────────────────────────────────────────────────────

export interface PlatformTradeResult {
  externalId: string;
  platformAccountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number | undefined;
  realizedPnl?: number | undefined;
  commission: number;
  entryTime: Date;
  exitTime?: Date | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// ── Dashboard / Login ───────────────────────────────────────────────────────

export interface PlatformLoginUrlResult {
  url: string;
}

export interface PlatformIFrameUrlResult {
  url: string;
}

/** iFrame variant type for the different embed modes */
export type IFrameType =
  | 'dashboard'
  | 'portfolio'
  | 'userGoal'
  | 'economicCalendar'
  | 'webApp';

// ── Trading Rules ──────────────────────────────────────────────────────────

export interface CreatePlatformTradingRuleParams {
  name: string;
  description?: string | undefined;
  /** Our idempotency key — maps to organizationReferenceId on the platform */
  organizationReferenceId?: string | undefined;
  maxDrawdownMoney: number;
  /** 0 = trailing (high-water mark), 1 = static (starting balance) */
  maxDrawdownMode: number;
  /** 1 = ChallengeFail */
  maxDrawdownAction: number;
  intradayMaxDrawdownMoney: number;
  /** 1 = ChallengeFail */
  intradayMaxDrawdownAction: number;
  profitTargetMoney?: number | undefined;
  /** 1 = ChallengeSuccess, 0 = None */
  profitTargetAction?: number | undefined;
  consistencyPercentual?: number | undefined;
  minSessionNumbers?: number | undefined;
  /** 0 = None, 2 = Liquidate, 4 = IntradayDisable */
  newsRestrictionAction?: number | undefined;
  /** 0 = None, 2 = Liquidate, 4 = IntradayDisable */
  overweekendAction?: number | undefined;
}

export interface PlatformTradingRuleResult {
  tradingRuleId: string;
  name: string;
  organizationReferenceId?: string | undefined;
}

// ── Paginated Response ─────────────────────────────────────────────────────

/** Wrapper for endpoints that support cursor-based pagination */
export interface PaginatedResult<T> {
  data: T;
  nextPageToken?: string | undefined;
}

// ── Bulk Operations ────────────────────────────────────────────────────────

/** Account header returned by bulk account listing endpoints */
export interface PlatformAccountHeader {
  platformAccountId: string;
  displayId?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  currency: string;
  startingBalance: number;
  balance: number;
  maxBalance: number;
  minBalance: number;
  sessionCount: number;
  enabled: boolean;
  mode: string;
  status: string;
  tradingPermission: string;
  visibility: string;
  createdAt: Date;
  disabledAt?: Date | undefined;
  endAt?: Date | undefined;
  tradingRuleId?: string | undefined;
  accountFamilyId?: string | undefined;
  reason?: string | undefined;
  owner?: PlatformAccountOwner | undefined;
}

export interface PlatformAccountOwner {
  platformUserId?: string | undefined;
  fullName?: string | undefined;
  username?: string | undefined;
  email?: string | undefined;
  externalId?: string | undefined;
}

/** Real-time account info/snapshot returned by bulk info endpoints */
export interface PlatformAccountInfo {
  status: string;
  tradingPermission: string;
  reason?: string | undefined;
  reasonTradingPermission?: string | undefined;
  riskPauseRestoreUtcMs?: number | undefined;
  tradingRuleId?: string | undefined;
  snapshot: PlatformAccountLiveSnapshot;
}

/** Real-time snapshot of account balances and risk metrics */
export interface PlatformAccountLiveSnapshot {
  platformAccountId: string;
  currency: string;
  startBalance: number;
  balance: number;
  equity?: number | undefined;
  marginAvailable: number;
  marginUsed: number;
  minBalance: number;
  maxBalance: number;
  dailyPnl: number;
  dailyNetPnl: number;
  intradayStartBalance: number;
  intradayMinBalance: number;
  intradayMaxBalance: number;
  intradayNumberOfTrades: number;
  stopDrawdownBalance?: number | undefined;
  stopDrawdownIntradayBalance?: number | undefined;
  profitTargetBalance?: number | undefined;
  updatedAt: Date;
}

/** Bulk trade result — keyed by account ID */
export interface PlatformBulkTrade {
  tradeId: number;
  symbolName?: string | undefined;
  contractName?: string | undefined;
  entryDate: number;
  exitDate: number;
  entrySessionDate: string;
  exitSessionDate: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  netPnl: number;
  convertedGrossPnl: number;
  convertedNetPnl: number;
  overnight: boolean;
  overweekend: boolean;
  isCloseTrade: boolean;
  maxDrawdown?: number | undefined;
  maxRunup?: number | undefined;
  currency?: string | undefined;
}

/** Bulk fill result — keyed by account ID */
export interface PlatformBulkFill {
  fillId: number;
  contractId: number;
  symbolName?: string | undefined;
  executedAt: Date;
  sessionDate: string;
  price: number;
  quantity: number;
  commissions: number;
}

/** Bulk order result — keyed by account ID */
export interface PlatformBulkOrder {
  orderId: number;
  contractId: number;
  symbolName?: string | undefined;
  status: string;
  orderType: string;
  insertedAt: Date;
  executedAt?: Date | undefined;
  cancelledAt?: Date | undefined;
  insertPrice: number;
  executePrice?: number | undefined;
  totalQuantity: number;
  filledQuantity: number;
  modified: boolean;
  source: string;
  reason: string;
}

/** Bulk transaction result — keyed by account ID */
export interface PlatformBulkTransaction {
  transactionId: number;
  accountId: number;
  occurredAt: Date;
  type: string;
  description?: string | undefined;
  amount: number;
}

/** Bulk daily snapshot — keyed by account ID */
export interface PlatformBulkDailySnapshot {
  platformAccountId: number;
  currency: string;
  startBalance: number;
  balance: number;
  equity?: number | undefined;
  marginAvailable: number;
  marginUsed: number;
  minBalance: number;
  maxBalance: number;
  intradayStartBalance: number;
  intradayMinBalance: number;
  intradayMaxBalance: number;
  intradayNumberOfTrades: number;
  dailyPnl: number;
  dailyNetPnl: number;
  stopDrawdownBalance?: number | undefined;
  stopDrawdownIntradayBalance?: number | undefined;
  profitTargetBalance?: number | undefined;
  updatedAt: Date;
  snapshotDate: Date;
}

/** Bulk session log entry */
export interface PlatformSessionLog {
  sessionId: number;
  appUserId?: string | undefined;
  startedAt: Date;
  endedAt?: Date | undefined;
  platform?: string | undefined;
  ip?: string | undefined;
}
