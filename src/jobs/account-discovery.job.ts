// =============================================================================
// Account Discovery Job
// =============================================================================
// Cron entrypoint for pull-based provisioning. Sweeps YPF tenant accounts and
// links any new ones back to a DF user (see account-discovery.service).
//
// Gated behind ACCOUNT_DISCOVERY_ENABLED — disabled by default until YPF
// confirms the email-match contract and we validate against a real account.
// =============================================================================

import { logger } from '../utils/logger.js';
import * as accountDiscoveryService from '../services/account-discovery.service.js';

export const runAccountDiscovery = async (): Promise<void> => {
  const startedAt = Date.now();
  logger.debug('account-discovery: starting sweep');

  const result = await accountDiscoveryService.discoverAccounts();

  logger.info(
    { ...result, durationMs: Date.now() - startedAt },
    'account-discovery: sweep finished',
  );
};
