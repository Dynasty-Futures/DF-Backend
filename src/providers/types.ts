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

// ── Trading Operations ────────────────────────────────────────────────────

export type OrderPositionFilter = 'All' | 'Buy' | 'Sell' | 'Winner' | 'Loser';

export interface CancelOrderParams {
  accountId: string;
  /** If undefined, all orders on the account are cancelled */
  orderId?: number | undefined;
  filter?: OrderPositionFilter | undefined;
}

export interface FlatPositionParams {
  accountId: string;
  /** If undefined, all positions on the account are flattened */
  contractId?: number | undefined;
  /** Required to close a specific position on hedging accounts */
  positionId?: number | undefined;
  filter?: OrderPositionFilter | undefined;
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'Disabled'
  | 'Active'
  | 'Scheduled'
  | 'UserOnHold'
  | 'PropfirmOnHold'
  | 'Error';

export type SubscriptionProviderStatus =
  | 'Disabled'
  | 'Enabled'
  | 'Suspended'
  | 'Terminated'
  | 'Blocked';

export type SubscriptionPlatform = 'VOLUMETRICA_TRADING' | 'QUANTOWER' | 'ATAS';

export interface PlatformSubscriptionResult {
  subscriptionId: string;
  confirmationId?: string | undefined;
  status: SubscriptionStatus;
  providerStatus?: SubscriptionProviderStatus | undefined;
  activation?: Date | undefined;
  expiration?: Date | undefined;
  dataFeedProducts?: number[] | undefined;
  agreementSigned: boolean;
  agreementLink?: string | undefined;
  selfCertification?: string | undefined;
  platform?: SubscriptionPlatform | undefined;
  volumetricaPlatform?: string | undefined;
  volumetricaLicense?: string | undefined;
  downloadLink?: string | undefined;
  userId?: string | undefined;
  lastVersionId: number;
}

export interface ListSubscriptionsParams {
  status?: SubscriptionStatus | undefined;
  platform?: SubscriptionPlatform | undefined;
  skip?: number | undefined;
  take?: number | undefined;
}

export interface ListSubscriptionsResult {
  total: number;
  filtered: number;
  subscriptions: PlatformSubscriptionResult[];
}

export interface CreateSubscriptionParams {
  userId: string;
  dataFeedProducts?: number[] | undefined;
  platform?: SubscriptionPlatform | undefined;
  startDate?: Date | undefined;
  durationMonths?: number | undefined;
  durationDays?: number | undefined;
  enabled: boolean;
  /** 1 = Deepchart, 2 = Deepdom */
  volumetricaPlatform?: number | undefined;
  forceUserOnboarding?: boolean | undefined;
  allowedSelfCertification?: number | undefined;
  redirectUrl?: string | undefined;
}

export interface ConfirmSubscriptionParams {
  subscriptionId: string;
  confirmationId: string;
}

export interface BulkDeactivateSubscriptionsParams {
  includeWithActiveTradingAccounts: boolean;
  considerScheduledTradingAccountAsActive: boolean;
}

export interface PlatformBulkDeactivateSubscriptionsResult {
  success: boolean;
  deactivated: PlatformSubscriptionResult[];
  errors: PlatformSubscriptionResult[];
}

// ── Account Management Enums ──────────────────────────────────────────────

export type AccountStatus = 'Initialized' | 'Enabled' | 'ChallengeSuccess' | 'ChallengeFailed' | 'Disabled';
export type TradingPermission = 'Trading' | 'ReadOnly' | 'RiskPause' | 'LiquidateOnly';
export type AccountVisibility = 'Default' | 'Hidden' | 'Visible';
export type BalanceUpdateAction = 'Add' | 'Subtract' | 'Set' | 'Withdraw' | 'Deposit' | 'InternalUpdate';
export type OrderFilterStatus = 'Cancelled' | 'Working' | 'Filled' | 'Rejected';
export type RuleReference = 'Application' | 'Organization' | 'OrganizationOwner';

// ── Account Management Params ─────────────────────────────────────────────

export interface ListAccountsByRuleParams {
  ruleId: string;
  includeDisabled?: boolean | undefined;
}

export interface ChangeAccountStatusParams {
  accountId: string;
  status?: AccountStatus | undefined;
  tradingPermission?: TradingPermission | undefined;
  reason?: string | undefined;
  forceClose?: boolean | undefined;
}

export interface ChangeAccountPermissionParams {
  accountId: string;
  tradingPermission: TradingPermission;
  forceClose?: boolean | undefined;
  reason?: string | undefined;
}

export interface ChangeAccountVisibilityParams {
  accountId: string;
  visibility?: AccountVisibility | undefined;
}

export interface UpdateAccountBalanceParams {
  accountId: string;
  action?: BalanceUpdateAction | undefined;
  value?: number | undefined;
  moveDrawdownToThresholdLimit?: boolean | undefined;
}

export interface ChangeAccountScheduleParams {
  accountId: string;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export interface BulkEnableAccountsParams {
  ruleReference?: RuleReference | undefined;
  ruleId?: string | undefined;
  tradingPermission?: TradingPermission | undefined;
  visibility?: AccountVisibility | undefined;
}

export interface BulkDisableAccountsParams {
  ruleReference?: RuleReference | undefined;
  ruleId?: string | undefined;
  reason?: string | undefined;
  forceClose?: boolean | undefined;
  visibility?: AccountVisibility | undefined;
}

// ── Account Management Results ────────────────────────────────────────────

/** Result of a bulk enable/disable operation */
export interface PlatformBulkEnableDisableResult {
  platformAccountId: string;
  success: boolean;
  errorMessage?: string | undefined;
  errorCode?: number | undefined;
}

// ── Account Listing ──────────────────────────────────────────────────────

export type AccountMode =
  | 'Evaluation'
  | 'SimFunded'
  | 'Funded'
  | 'Live'
  | 'Trial'
  | 'Contest'
  | 'Training';

export interface ListAccountsParams {
  mode?: AccountMode | undefined;
  status?: AccountStatus | undefined;
  permission?: TradingPermission | undefined;
  familyId?: string | undefined;
  groupUniverseId?: string | undefined;
  tradingRuleId?: string | undefined;
  filter?: string | undefined;
  skip?: number | undefined;
  take?: number | undefined;
}

export interface ListAccountsResult {
  total: number;
  filtered: number;
  accounts: PlatformAccountHeader[];
}

// ── User Listing ─────────────────────────────────────────────────────────

export interface ListUsersParams {
  /** Platform user type enum (numeric) */
  userType?: number | undefined;
  /** Organization status enum (numeric) */
  organizationStatus?: number | undefined;
  subscriptionStatus?: SubscriptionStatus | undefined;
  platform?: SubscriptionPlatform | undefined;
  filter?: string | undefined;
  skip?: number | undefined;
  take?: number | undefined;
}

export interface ListUsersResult {
  total: number;
  filtered: number;
  users: PlatformUserResult[];
}

// ── Currency Rates ───────────────────────────────────────────────────────

export interface PlatformCurrencyRate {
  baseCurrency: string;
  conversionCurrency: string;
  frequencyUpdate: string;
  exchangeRate: number;
  spreadType: string;
  spread: number;
  lastUpdate: Date;
}

export interface UpdateCurrencyRateParams {
  baseCurrency: string;
  conversionCurrency: string;
  /** 0=Manually, 1=Daily, 2=Weekly, 3=Monthly */
  frequencyUpdate?: number | undefined;
  exchangeRate?: number | undefined;
  /** 0=Absolute, 1=Percentual */
  spreadType?: number | undefined;
  spread?: number | undefined;
}

// ── Economic News ────────────────────────────────────────────────────────

export interface PlatformEconomicNewsEvent {
  eventId: number;
  utcUnixMs: number;
  description?: string | undefined;
  countryIso?: string | undefined;
  /** 'Info' | 'Low' | 'Medium' | 'High' */
  intensity: string;
  inhibit: boolean;
}

export interface UpdateEconomicNewsParams {
  resetAll: boolean;
  events: PlatformEconomicNewsEvent[];
}

// ── Export ────────────────────────────────────────────────────────────────

export interface ExportTradeListParams {
  startDt: Date;
  endDt?: Date | undefined;
  rawPositions?: boolean | undefined;
}

// ── Group Universe ───────────────────────────────────────────────────────

export interface PlatformGroupUniverseExchange {
  exchangeId: number;
  commissionsMode?: number | undefined;
  commissions: number;
  makerCommissions?: number | undefined;
  minContractsCalculation?: number | undefined;
  minContractsValue?: number | undefined;
  multipleContracts?: number | undefined;
  minMoneyExpositionUnit?: number | undefined;
  minMoneyExpositionValue?: number | undefined;
  maxMoneyExpositionUnit?: number | undefined;
  maxMoneyExpositionValue?: number | undefined;
  leverage?: number | undefined;
}

export interface PlatformGroupUniverseSymbol {
  symbolId: number;
  margin?: number | undefined;
  commissions?: number | undefined;
  makerCommissions?: number | undefined;
  maxContracts?: number | undefined;
  maxMoneyExposition?: number | undefined;
  leverage?: number | undefined;
}

export interface PlatformGroupUniverseSymbolGroup {
  symbolGroupId?: string | undefined;
  margin?: number | undefined;
  commissions?: number | undefined;
  maxContractsSumMode?: number | undefined;
  maxContractsCalculation?: number | undefined;
  maxContractsValue?: number | undefined;
}

export interface PlatformGroupUniverseResult {
  groupId: string;
  description?: string | undefined;
  organizationReferenceId?: string | undefined;
  productType: string;
  symbolAllowedMode: string;
  excludeSymbolsNotListed: boolean;
  inhibitTradeCopier: boolean;
  exchanges?: PlatformGroupUniverseExchange[] | undefined;
  symbols?: PlatformGroupUniverseSymbol[] | undefined;
  symbolGroups?: PlatformGroupUniverseSymbolGroup[] | undefined;
  borrowSymbols?: number[] | undefined;
}

export interface CreateGroupUniverseParams {
  groupId?: string | undefined;
  description?: string | undefined;
  organizationReferenceId?: string | undefined;
  /** 0=Future, 1=Stocks, 2=Options, 3=CFD, 4=Crypto, -1=Universal */
  productType: number;
  /** 0=SymbolsListed, 1=Exchanges, 2=All */
  symbolAllowedMode: number;
  /** 0=Quantity, 1=Order, 2=PercentualCountervalue */
  commissionsMode?: number | undefined;
  /** 0=EntryAndExit, 1=EntryOnly, 2=ExitOnly */
  commissionsCharge?: number | undefined;
  defaultCommissions?: number | undefined;
  minOrderCommissions?: number | undefined;
  maxOrderCommissions?: number | undefined;
  maxOrdersAccountCount?: number | undefined;
  maxOrdersSymbolCount?: number | undefined;
  economicNewsCountries?: string | undefined;
  inhibitTradeCopier?: boolean | undefined;
  intradayLiquidationMinsBefore?: number | undefined;
  exchanges?: PlatformGroupUniverseExchange[] | undefined;
  symbols?: PlatformGroupUniverseSymbol[] | undefined;
  symbolGroups?: PlatformGroupUniverseSymbolGroup[] | undefined;
  borrowSymbols?: number[] | undefined;
}

export interface ListGroupUniversesParams {
  filter?: string | undefined;
  skip?: number | undefined;
  take?: number | undefined;
}

export interface ListGroupUniversesResult {
  total: number;
  filtered: number;
  groupUniverses: PlatformGroupUniverseResult[];
}

// ── Symbols ──────────────────────────────────────────────────────────────

export interface PlatformSymbolInfo {
  id: number;
  name?: string | undefined;
  description?: string | undefined;
  exchange?: string | undefined;
  symbolGroup?: string | undefined;
  margin: number;
  commission: number;
  inhibitTrading: boolean;
  archived: boolean;
  adv14D?: number | undefined;
  adv50D?: number | undefined;
  adc14D?: number | undefined;
  forceSubscription: boolean;
  tickSize: number;
  tickValue: number;
  baseCurrency?: string | undefined;
  quoteCurrency?: string | undefined;
  category?: string | undefined;
}

// ── Trading Rule Updates ─────────────────────────────────────────────────

export interface PlatformValidationResult {
  valid: boolean;
  errors?: Record<string, string> | undefined;
}

export interface DuplicateTradingRuleParams {
  ruleId: string;
  ruleReference?: RuleReference | undefined;
  newOrganizationRuleId?: string | undefined;
  newDescription?: string | undefined;
}

export interface ChangeTradingRuleGroupUniverseParams {
  ruleId: string;
  ruleReference?: RuleReference | undefined;
  groupId: string;
  groupUniverseReference?: RuleReference | undefined;
}

// ── Trading Token / WSS ──────────────────────────────────────────────────

export interface GenerateTradingTokenParams {
  login: string;
  password: string;
  version?: number | undefined;
  platform?: SubscriptionPlatform | undefined;
}

export interface PlatformTradingTokenResult {
  wssEndpoint?: string | undefined;
  wssToken?: string | undefined;
  restReportHost?: string | undefined;
  restReportToken?: string | undefined;
  restTokenExpiration: number;
  tradingApiVersion: number;
}

export interface AuthTradingWssParams {
  userId: string;
  platform?: SubscriptionPlatform | undefined;
  onlyTrading?: boolean | undefined;
  ip?: string | undefined;
  version?: number | undefined;
}

export interface PlatformTradingWssAuthResult {
  wssEndpoint?: string | undefined;
  wssToken?: string | undefined;
  restReportHost?: string | undefined;
  restReportToken?: string | undefined;
  restTokenExpiration: number;
  tradingApiVersion: number;
  dataRealtimeEndpoint?: string | undefined;
  dataToken?: string | undefined;
  dataIpfEndpoint?: string | undefined;
  dataExchanges?: string[] | undefined;
}

// ── Webhook ──────────────────────────────────────────────────────────────

export interface PlatformWebhookEvent {
  occurredAt: Date;
  category: string;
  event: string;
  userId?: string | undefined;
  accountId?: string | undefined;
  tradingAccount?: Record<string, unknown> | undefined;
  tradingPosition?: Record<string, unknown> | undefined;
  subscription?: Record<string, unknown> | undefined;
  tradeReport?: Record<string, unknown> | undefined;
  tradingPortfolio?: Record<string, unknown> | undefined;
  organizationUser?: Record<string, unknown> | undefined;
}

export interface PlatformWebhookBulkEvent {
  id?: string | undefined;
  data: PlatformWebhookEvent;
}
