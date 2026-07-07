// =============================================================================
// Trading Platform Provider Interface
// =============================================================================
// All external trading platforms implement this interface. The rest of the
// application codes against these operations and never touches platform-specific
// HTTP calls directly.
//
// Naming convention: methods take `(platformUserId, platformAccountId)` pairs to
// match YPF's nested URL shape `/users/{userId}/accounts/{accountId}`. Provider
// implementations for flat-resource platforms (e.g. legacy Volumetrica) can
// ignore the userId arg.
// =============================================================================

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
} from './types.js';

export interface TradingPlatformProvider {
  // ── User Operations ─────────────────────────────────────────────────────

  createUser(params: CreatePlatformUserParams): Promise<PlatformUserResult>;
  getUser(platformUserId: string): Promise<PlatformUserResult>;
  requestKyc(platformUserId: string): Promise<void>;

  // ── Account Lifecycle ────────────────────────────────────────────────────

  createAccount(params: CreatePlatformAccountParams): Promise<PlatformAccountResult>;
  getAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult>;
  listUserAccounts(platformUserId: string): Promise<PlatformAccountResult[]>;
  blockAccount(platformUserId: string, platformAccountId: string): Promise<void>;
  resetAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult>;
  reactivateAccount(
    platformUserId: string,
    platformAccountId: string,
    balanceSource?: 'initial' | 'last' | undefined,
  ): Promise<PlatformAccountResult>;
  manualBreachAccount(
    platformUserId: string,
    platformAccountId: string,
    ruleName: string,
    reason?: string | undefined,
  ): Promise<void>;
  manualUpgradeAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult>;
  /** Standard upgrade to the next program level (eval → funded). */
  upgradeAccount(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformAccountResult>;
  updateAccountBalance(
    platformUserId: string,
    platformAccountId: string,
    amount: number,
  ): Promise<void>;
  /** Mint a short-lived encrypted `ypf-ref` code binding a user+account to a
   * WooCommerce checkout (reset / activation). Null when the platform failed
   * to generate one (YPF's "N/A"). */
  getRefCode(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<string | null>;

  // ── Data Retrieval (account-scoped under user) ──────────────────────────

  getDailySnapshots(
    platformUserId: string,
    platformAccountId: string,
    startDt?: Date | undefined,
  ): Promise<PlatformSnapshotResult[]>;
  getHistoricalTrades(
    platformUserId: string,
    platformAccountId: string,
    startDt: Date,
    endDt?: Date | undefined,
  ): Promise<PlatformTradeResult[]>;

  // ── Breach Detection (polling source of truth) ──────────────────────────

  getAccountBreaches(
    platformUserId: string,
    platformAccountId: string,
  ): Promise<PlatformBreachResult[]>;
  getTenantBreaches(
    platformAccountIds: string[],
    startDt?: Date | undefined,
    endDt?: Date | undefined,
  ): Promise<PlatformBreachResult[]>;

  // ── Tenant-wide Poll ─────────────────────────────────────────────────────

  listTenantAccounts(status?: string): Promise<PlatformAccountResult[]>;

  // ── Programs (read-only at runtime; seeded by admin script) ─────────────

  getProgram(programId: string): Promise<PlatformProgramResult>;
  listPrograms(params?: ListProgramsParams | undefined): Promise<PlatformProgramResult[]>;

  // ── Payouts ──────────────────────────────────────────────────────────────

  createPayout(
    platformUserId: string,
    params: CreatePlatformPayoutParams,
  ): Promise<PlatformPayoutResult>;
  listPayouts(params?: ListPayoutsParams | undefined): Promise<PlatformPayoutResult[]>;
  approvePayout(platformPayoutId: string): Promise<void>;
  rejectPayout(platformPayoutId: string, reason?: string | undefined): Promise<void>;
}
