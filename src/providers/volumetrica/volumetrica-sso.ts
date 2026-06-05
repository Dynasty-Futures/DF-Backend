// =============================================================================
// Volumetrica SSO Module
// =============================================================================
// Thin Volumetrica-direct integration retained ONLY for trader-dashboard SSO.
// YPF v1 has no equivalent endpoints, and the frontend `OpenPlatformButton.tsx`
// depends on these URLs to embed Volumetrica's web UI inside our trader portal.
//
// This module is NOT behind the `TradingPlatformProvider` interface — it's an
// orthogonal execution-plane concern called directly by `trading.service.ts`.
// The Volumetrica user ID it requires is persisted on `Account.volumetricaUserId`
// (sourced from YPF's `account.extraValues.VolumetricaUserId`).
// =============================================================================

import { VolumetricaClient } from './volumetrica.client.js';

const API = '/api/v2/Propsite';

export type VolumetricaIFrameType =
  | 'dashboard'
  | 'portfolio'
  | 'userGoal'
  | 'economicCalendar'
  | 'webApp';

const IFRAME_PATHS: Record<VolumetricaIFrameType, string> = {
  dashboard: `${API}/User/IFrame`,
  portfolio: `${API}/User/IFramePortfolio`,
  userGoal: `${API}/User/IFrameUserGoal`,
  economicCalendar: `${API}/User/IFrameEconomicCalendar`,
  webApp: `${API}/User/VolumetricaWebApp`,
};

let _cachedClient: VolumetricaClient | null = null;

const getClient = (): VolumetricaClient => {
  if (!_cachedClient) _cachedClient = new VolumetricaClient();
  return _cachedClient;
};

/**
 * Resolve a one-shot login URL for the trader's Volumetrica web UI.
 * Used by the "Open Platform" button to redirect the trader into Volumetrica.
 */
export const getVolumetricaLoginUrl = async (
  volumetricaUserId: string,
): Promise<string> => {
  return getClient().post<string>(`${API}/User/LoginUrl`, {
    userId: volumetricaUserId,
  });
};

/**
 * Resolve an iframe-embeddable URL for the requested Volumetrica UI surface.
 */
export const getVolumetricaIFrameUrl = async (
  volumetricaUserId: string,
  type: VolumetricaIFrameType = 'dashboard',
  volumetricaAccountId?: string,
): Promise<string> => {
  const path = IFRAME_PATHS[type];
  const body: Record<string, unknown> = { userId: volumetricaUserId };
  if (volumetricaAccountId) body['accountId'] = volumetricaAccountId;
  return getClient().post<string>(path, body);
};
