// =============================================================================
// Affiliate Platform Client
// =============================================================================
// Thin wrapper around the separate Affiliate Platform API
// (affiliates.production.quant-technology.team) — NOT the YPF client API.
//
// Phase 1 uses only the PUBLIC partner-registration endpoint, which needs the
// `X-Tenant-ID` header (no auth token). Phase 2 (dashboard reads / impersonation)
// will add the `X-Service-Token` header once YPF provides one.
// =============================================================================

import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const REQUEST_TIMEOUT_MS = 15_000;

export interface RegisterPartnerInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  externalId?: string | undefined;
  preferredAffiliateCode?: string | undefined;
  sponsorRefCode?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RegisterPartnerResult {
  /** Affiliate-platform partner id (uuid), when returned. */
  partnerId?: string | undefined;
  status?: string | undefined;
  /** True when the partner already existed (HTTP 409) — treated as success. */
  alreadyExists: boolean;
}

/** Whether registration is configured + enabled. */
export const isAffiliateRegistrationEnabled = (): boolean =>
  config.affiliate.registrationEnabled && Boolean(config.affiliate.tenantId);

/**
 * Register a new affiliate partner. Throws on a non-2xx (other than 409, which
 * is surfaced as `alreadyExists`) so the caller can decide how to handle it.
 */
export const registerPartner = async (
  input: RegisterPartnerInput,
): Promise<RegisterPartnerResult> => {
  const base = config.affiliate.apiUrl.replace(/\/+$/, '');

  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Tenant-ID': config.affiliate.tenantId,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 409) {
    logger.info(
      { email: input.email, externalId: input.externalId },
      'affiliate-platform: partner already exists (409)',
    );
    return { alreadyExists: true };
  }

  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    const msg =
      (body && (body['message'] || body['error'])) || `HTTP ${res.status}`;
    throw new Error(`Affiliate registration failed: ${String(msg)}`);
  }

  return {
    partnerId: (body?.['id'] as string | undefined) ?? undefined,
    status: (body?.['status'] as string | undefined) ?? undefined,
    alreadyExists: false,
  };
};
