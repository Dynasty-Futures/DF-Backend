// =============================================================================
// KYC Service
// =============================================================================
// Identity verification is owned by YPF: it runs the Sumsub flow in its hosted
// portal and tracks the result on the YPF user's `kycStatus`. DF does NOT host
// Sumsub. This service (Option A) does two things:
//   1. SYNC — pull YPF's `kycStatus` into our local `User.kycStatus` so the
//      dashboard badge is truthful (it was previously stuck at NOT_STARTED).
//   2. REQUEST — `PUT /users/{userId}/requestkyc` so a trader can initiate
//      verification from our dashboard before being handed off to YPF's portal.
// =============================================================================

import { KycStatus } from '@prisma/client';
import { getTradingPlatformProvider } from '../providers/index.js';
import { getUserById, updateKycStatus } from '../repositories/user.repository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Map YPF's raw KYC status string onto our local enum. Defensive/synonym-aware
 * (the documented type is just "string"; observed values: "None", "Pending").
 * Unknown/unset → NOT_STARTED so we never wrongly show "verified".
 */
export const mapYpfKycStatus = (raw?: string): KycStatus => {
  const v = (raw ?? '').trim().toLowerCase();
  if (['approved', 'completed', 'verified', 'success', 'passed'].includes(v)) {
    return KycStatus.APPROVED;
  }
  if (['rejected', 'declined', 'failed', 'denied'].includes(v)) {
    return KycStatus.REJECTED;
  }
  if (
    ['pending', 'processing', 'inprogress', 'submitted', 'onhold', 'review', 'init'].includes(v)
  ) {
    return KycStatus.PENDING;
  }
  return KycStatus.NOT_STARTED;
};

export interface KycStatusResult {
  status: KycStatus;
  /** True once the user has a YPF account so verification can actually run. */
  linked: boolean;
}

/**
 * Refresh the user's KYC status from YPF and persist it locally. Best-effort:
 * if the user isn't linked to YPF yet, or YPF is unreachable, returns the last
 * known local status rather than throwing.
 */
export const syncUserKyc = async (userId: string): Promise<KycStatusResult> => {
  const user = await getUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  if (!user.platformUserId) {
    return { status: user.kycStatus, linked: false };
  }

  try {
    const provider = getTradingPlatformProvider();
    const platformUser = await provider.getUser(user.platformUserId);
    const mapped = mapYpfKycStatus(platformUser.kycStatus);
    if (mapped !== user.kycStatus) {
      await updateKycStatus(userId, mapped);
      logger.info(
        { userId, from: user.kycStatus, to: mapped, raw: platformUser.kycStatus },
        'kyc: status synced from YPF',
      );
    }
    return { status: mapped, linked: true };
  } catch (err) {
    logger.warn({ err, userId }, 'kyc: sync failed — returning last known status');
    return { status: user.kycStatus, linked: true };
  }
};

/**
 * Request KYC for the user on YPF (flips their requestKyc flag → Sumsub prompt),
 * then re-syncs the status. Requires the user to be linked to a YPF account.
 */
export const requestKyc = async (userId: string): Promise<KycStatusResult> => {
  const user = await getUserById(userId);
  if (!user) throw new NotFoundError('User not found');
  if (!user.platformUserId) {
    throw new BadRequestError(
      'Identity verification becomes available once you have a trading account.',
    );
  }

  const provider = getTradingPlatformProvider();
  await provider.requestKyc(user.platformUserId);
  logger.info({ userId }, 'kyc: requested verification on YPF');

  return syncUserKyc(userId);
};
