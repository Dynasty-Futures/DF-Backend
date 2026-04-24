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
  ListAccountsByRuleParams,
  ChangeAccountStatusParams,
  ChangeAccountPermissionParams,
  ChangeAccountVisibilityParams,
  UpdateAccountBalanceParams,
  ChangeAccountScheduleParams,
  BulkEnableAccountsParams,
  BulkDisableAccountsParams,
  PlatformBulkEnableDisableResult,
  OrderFilterStatus,
  CancelOrderParams,
  FlatPositionParams,
  ListSubscriptionsParams,
  ListSubscriptionsResult,
  PlatformSubscriptionResult,
  CreateSubscriptionParams,
  ConfirmSubscriptionParams,
  BulkDeactivateSubscriptionsParams,
  PlatformBulkDeactivateSubscriptionsResult,
  ListAccountsParams,
  ListAccountsResult,
  ListUsersParams,
  ListUsersResult,
  PlatformCurrencyRate,
  UpdateCurrencyRateParams,
  PlatformEconomicNewsEvent,
  UpdateEconomicNewsParams,
  ExportTradeListParams,
  PlatformGroupUniverseResult,
  CreateGroupUniverseParams,
  ListGroupUniversesParams,
  ListGroupUniversesResult,
  PlatformSymbolInfo,
  PlatformValidationResult,
  DuplicateTradingRuleParams,
  ChangeTradingRuleGroupUniverseParams,
  GenerateTradingTokenParams,
  PlatformTradingTokenResult,
  AuthTradingWssParams,
  PlatformTradingWssAuthResult,
  PlatformWebhookEvent,
  PlatformWebhookBulkEvent,
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

  // ── Account Management ──────────────────────────────────────────────

  /** List accounts associated with a trading rule. */
  listAccountsByRule(params: ListAccountsByRuleParams): Promise<PlatformAccountHeader[]>;

  /** Get historical orders for a single account. */
  getHistoricalOrders(
    accountId: string,
    startDt: Date,
    endDt?: Date | undefined,
    filterStatus?: OrderFilterStatus | undefined,
  ): Promise<PlatformBulkOrder[]>;

  /** Get historical transactions for a single account. */
  getHistoricalTransactions(
    accountId: string,
    startDt: Date,
    endDt?: Date | undefined,
  ): Promise<PlatformBulkTransaction[]>;

  /** Get IDs of all currently enabled accounts. */
  getEnabledAccountIds(): Promise<string[]>;

  /** Bulk enable accounts matching criteria. */
  bulkEnableAccounts(params: BulkEnableAccountsParams): Promise<PlatformBulkEnableDisableResult[]>;

  /** Bulk disable accounts matching criteria. */
  bulkDisableAccounts(params: BulkDisableAccountsParams): Promise<PlatformBulkEnableDisableResult[]>;

  /** Change account status (enable/disable/challenge state). */
  changeAccountStatus(params: ChangeAccountStatusParams): Promise<PlatformAccountHeader>;

  /** Change account trading permission. */
  changeAccountPermission(params: ChangeAccountPermissionParams): Promise<PlatformAccountHeader>;

  /** Change account visibility. */
  changeAccountVisibility(params: ChangeAccountVisibilityParams): Promise<PlatformAccountHeader>;

  /** Update account balance (add/subtract/set/deposit/withdraw). */
  updateAccountBalance(params: UpdateAccountBalanceParams): Promise<void>;

  /** Change account schedule (start/end dates). */
  changeAccountSchedule(params: ChangeAccountScheduleParams): Promise<PlatformAccountHeader>;

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

  // ── Trading Operations ──────────────────────────────────────────────────

  /** Cancel one or all orders on an account. */
  cancelOrder(params: CancelOrderParams): Promise<void>;

  /** Flatten one or all positions on an account. */
  flatPosition(params: FlatPositionParams): Promise<void>;

  // ── Subscription Operations ─────────────────────────────────────────────

  /** List subscriptions with optional filters. */
  listSubscriptions(params?: ListSubscriptionsParams | undefined): Promise<ListSubscriptionsResult>;

  /** Get a subscription by subscriptionId or userId. */
  getSubscription(opts: { userId?: string | undefined; subscriptionId?: string | undefined }): Promise<PlatformSubscriptionResult>;

  /** Create a new subscription. */
  createSubscription(params: CreateSubscriptionParams): Promise<PlatformSubscriptionResult>;

  /** Update an existing subscription. */
  updateSubscription(subscriptionId: string, params: CreateSubscriptionParams): Promise<PlatformSubscriptionResult>;

  /** Delete a subscription. */
  deleteSubscription(subscriptionId: string): Promise<void>;

  /** Activate a scheduled or disabled subscription. */
  activateSubscription(subscriptionId: string): Promise<PlatformSubscriptionResult>;

  /** Confirm a subscription on hold by the propfirm. */
  confirmSubscription(params: ConfirmSubscriptionParams): Promise<PlatformSubscriptionResult>;

  /** Deactivate a subscription. */
  deactivateSubscription(subscriptionId: string): Promise<PlatformSubscriptionResult>;

  /** Bulk deactivate subscriptions based on conditions. */
  bulkDeactivateSubscriptions(params: BulkDeactivateSubscriptionsParams): Promise<PlatformBulkDeactivateSubscriptionsResult>;

  // ── Account / User Listing ─────────────────────────────────────────────

  /** List trading accounts with filters and pagination. */
  listAccounts(params?: ListAccountsParams | undefined): Promise<ListAccountsResult>;

  /** List users with filters and pagination. */
  listUsers(params?: ListUsersParams | undefined): Promise<ListUsersResult>;

  // ── Currency Rates ─────────────────────────────────────────────────────

  /** Get global currency exchange rates. */
  getCurrencyRates(): Promise<PlatformCurrencyRate[]>;

  /** Update currency exchange rates. */
  updateCurrencyRates(rates: UpdateCurrencyRateParams[]): Promise<void>;

  // ── Economic News ──────────────────────────────────────────────────────

  /** Get economic news events available for inhibit. */
  getEconomicNews(): Promise<PlatformEconomicNewsEvent[]>;

  /** Update which economic news events inhibit trading. */
  updateEconomicNewsInhibit(params: UpdateEconomicNewsParams): Promise<void>;

  // ── Export ─────────────────────────────────────────────────────────────

  /** Export trade list as CSV between two dates. */
  exportTradeListCsv(params: ExportTradeListParams): Promise<string>;

  // ── Group Universe ─────────────────────────────────────────────────────

  /** List group universes with pagination. */
  listGroupUniverses(params?: ListGroupUniversesParams | undefined): Promise<ListGroupUniversesResult>;

  /** Get a single group universe by ID. */
  getGroupUniverse(groupId: string, reference?: string | undefined): Promise<PlatformGroupUniverseResult>;

  /** Create a new group universe. */
  createGroupUniverse(params: CreateGroupUniverseParams): Promise<PlatformGroupUniverseResult>;

  /** Update an existing group universe. */
  updateGroupUniverse(
    groupId: string,
    params: CreateGroupUniverseParams,
    reference?: string | undefined,
  ): Promise<PlatformGroupUniverseResult>;

  // ── Symbols ────────────────────────────────────────────────────────────

  /** List available trading symbols. */
  listSymbols(): Promise<PlatformSymbolInfo[]>;

  /** Get the contract name for a given contract ID. */
  getContractName(contractId: number): Promise<string>;

  /** Get the symbol name for a given contract ID. */
  getSymbolName(contractId: number): Promise<string>;

  // ── Trading Rule Updates ───────────────────────────────────────────────

  /** Update an existing trading rule. */
  updateTradingRule(
    ruleId: string,
    params: CreatePlatformTradingRuleParams,
    reference?: string | undefined,
  ): Promise<PlatformTradingRuleResult>;

  /** Validate a trading rule without creating it. */
  validateTradingRule(params: CreatePlatformTradingRuleParams): Promise<PlatformValidationResult>;

  /** Change the group universe associated with a trading rule. */
  changeTradingRuleGroupUniverse(params: ChangeTradingRuleGroupUniverseParams): Promise<void>;

  /** Duplicate an existing trading rule. */
  duplicateTradingRule(params: DuplicateTradingRuleParams): Promise<PlatformTradingRuleResult>;

  // ── Trading Token / WSS ────────────────────────────────────────────────

  /** Generate a trading token for WSS connection. */
  generateTradingToken(params: GenerateTradingTokenParams): Promise<PlatformTradingTokenResult>;

  /** Authenticate for trading WSS with full data feed info. */
  authTradingWss(params: AuthTradingWssParams): Promise<PlatformTradingWssAuthResult>;

  // ── Webhook Reference ──────────────────────────────────────────────────

  /** Get the webhook event model (reference/documentation endpoint). */
  getWebhookModel(): Promise<PlatformWebhookEvent>;

  /** Get the bulk webhook event model (reference/documentation endpoint). */
  getWebhookBulkModel(): Promise<PlatformWebhookBulkEvent[]>;
}
