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
}
