import { AffiliateApplicationStatus, AffiliateCouponStatus } from '@prisma/client';
import {
  submitApplication,
  handleAffiliateWebhookEvent,
  getMyAffiliateStatus,
  SubmitAffiliateApplicationInput,
} from '../affiliate.service';
import { ValidationError } from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockCreateAffiliateApplication = jest.fn();
const mockUpdateApplicationPlatformResult = jest.fn();
const mockFindApplicationForWebhook = jest.fn();
const mockFindLatestApplicationByCreator = jest.fn();
const mockFindCouponsByCreator = jest.fn();
const mockUpsertAffiliateCoupon = jest.fn();
const mockSendAffiliateApplicationNotification = jest.fn();
const mockGetUserById = jest.fn();
const mockIsRegEnabled = jest.fn();
const mockRegisterPartner = jest.fn();
const mockFetchPartnerDashboard = jest.fn();

jest.mock('../../repositories/affiliate.repository', () => ({
  createAffiliateApplication: (...args: unknown[]) => mockCreateAffiliateApplication(...args),
  updateApplicationPlatformResult: (...args: unknown[]) =>
    mockUpdateApplicationPlatformResult(...args),
  findApplicationForWebhook: (...args: unknown[]) => mockFindApplicationForWebhook(...args),
  findLatestApplicationByCreator: (...args: unknown[]) =>
    mockFindLatestApplicationByCreator(...args),
  findCouponsByCreator: (...args: unknown[]) => mockFindCouponsByCreator(...args),
  upsertAffiliateCoupon: (...args: unknown[]) => mockUpsertAffiliateCoupon(...args),
}));

jest.mock('../../repositories/user.repository', () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

jest.mock('../../providers/affiliate/affiliate-platform.client', () => ({
  isAffiliateRegistrationEnabled: () => mockIsRegEnabled(),
  registerPartner: (...args: unknown[]) => mockRegisterPartner(...args),
  fetchPartnerDashboard: (...args: unknown[]) => mockFetchPartnerDashboard(...args),
}));

jest.mock('../email.service', () => ({
  sendAffiliateApplicationNotification: (...args: unknown[]) =>
    mockSendAffiliateApplicationNotification(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// =============================================================================
// Fixtures
// =============================================================================

const validInput = (): SubmitAffiliateApplicationInput => ({
  websiteUrl: 'https://mysite.com',
  isFundedTrader: true,
  hasActiveDynastyAccount: false,
  promotionPlan: 'YouTube reviews and a newsletter.',
  primaryTrafficMethod: 'Long-form YouTube videos.',
  createsCustomContent: true,
  contentUpdateFrequency: 'Weekly, YouTube drives the most traffic.',
  preferredAffiliateCode: 'goat15',
  restrictedJurisdictionConfirmation: true,
});

const persisted = (overrides: Record<string, unknown> = {}) => ({
  id: 'app-1',
  creatorId: null,
  applicantEmail: null,
  websiteUrl: 'https://mysite.com',
  youtubeUrl: null,
  xUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  telegramUrl: null,
  discordUrl: null,
  isFundedTrader: true,
  hasActiveDynastyAccount: false,
  promotionPlan: 'YouTube reviews and a newsletter.',
  primaryTrafficMethod: 'Long-form YouTube videos.',
  createsCustomContent: true,
  contentUpdateFrequency: 'Weekly, YouTube drives the most traffic.',
  preferredAffiliateCode: 'GOAT15',
  restrictedJurisdictionConfirmation: true,
  status: AffiliateApplicationStatus.PENDING,
  createdAt: new Date('2026-06-08'),
  updatedAt: new Date('2026-06-08'),
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('affiliateService.submitApplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAffiliateApplication.mockResolvedValue(persisted());
    mockSendAffiliateApplicationNotification.mockResolvedValue(undefined);
    mockIsRegEnabled.mockReturnValue(false); // registration off unless a test enables it
    mockUpdateApplicationPlatformResult.mockResolvedValue(undefined);
  });

  it('persists a valid application and fires the notification email', async () => {
    const result = await submitApplication(validInput());

    expect(mockCreateAffiliateApplication).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('app-1');
    expect(result.status).toBe(AffiliateApplicationStatus.PENDING);
    expect(mockSendAffiliateApplicationNotification).toHaveBeenCalledWith(persisted());
  });

  it('normalizes the affiliate code to uppercase and trims text fields', async () => {
    await submitApplication({
      ...validInput(),
      preferredAffiliateCode: '  goat15  ',
      promotionPlan: '  has spaces  ',
    });

    const data = mockCreateAffiliateApplication.mock.calls[0][0];
    expect(data.preferredAffiliateCode).toBe('GOAT15');
    expect(data.promotionPlan).toBe('has spaces');
  });

  it('captures creatorId and applicantEmail when the submitter is authenticated', async () => {
    await submitApplication({
      ...validInput(),
      creatorId: 'user-1',
      applicantEmail: 'Trader@Example.com',
    });

    const data = mockCreateAffiliateApplication.mock.calls[0][0];
    expect(data.creatorId).toBe('user-1');
    expect(data.applicantEmail).toBe('trader@example.com');
  });

  it('accepts an application with a non-website social URL', async () => {
    await expect(
      submitApplication({
        ...validInput(),
        websiteUrl: undefined,
        discordUrl: 'https://discord.gg/abc',
      })
    ).resolves.toBeDefined();
  });

  it('rejects when no website or social URL is provided', async () => {
    await expect(
      submitApplication({ ...validInput(), websiteUrl: undefined })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreateAffiliateApplication).not.toHaveBeenCalled();
  });

  it('rejects when the restricted-jurisdiction confirmation is missing', async () => {
    await expect(
      submitApplication({ ...validInput(), restrictedJurisdictionConfirmation: false })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreateAffiliateApplication).not.toHaveBeenCalled();
  });

  it('rejects when the preferred affiliate code is blank', async () => {
    await expect(
      submitApplication({ ...validInput(), preferredAffiliateCode: '   ' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('still resolves when the notification email fails (fire-and-forget)', async () => {
    mockSendAffiliateApplicationNotification.mockRejectedValueOnce(new Error('SES down'));

    await expect(submitApplication(validInput())).resolves.toBeDefined();
  });

  it('does not register on the affiliate platform when disabled', async () => {
    mockIsRegEnabled.mockReturnValue(false);
    await submitApplication({ ...validInput(), creatorId: 'user-1' });
    await flush();
    expect(mockRegisterPartner).not.toHaveBeenCalled();
  });

  it('does not register for anonymous applicants (no creatorId)', async () => {
    mockIsRegEnabled.mockReturnValue(true);
    await submitApplication(validInput());
    await flush();
    expect(mockRegisterPartner).not.toHaveBeenCalled();
  });

  it('registers the partner and records the result when enabled', async () => {
    mockIsRegEnabled.mockReturnValue(true);
    mockCreateAffiliateApplication.mockResolvedValue(
      persisted({ id: 'app-9', creatorId: 'user-1', preferredAffiliateCode: 'GOAT15' })
    );
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'trader@example.com',
      firstName: 'Goat',
      lastName: 'Trader',
    });
    mockRegisterPartner.mockResolvedValue({
      partnerId: 'partner-123',
      status: 'PENDING',
      alreadyExists: false,
    });

    await submitApplication({ ...validInput(), creatorId: 'user-1' });
    await flush();

    expect(mockRegisterPartner).toHaveBeenCalledTimes(1);
    const payload = mockRegisterPartner.mock.calls[0][0];
    expect(payload).toMatchObject({
      email: 'trader@example.com',
      firstName: 'Goat',
      lastName: 'Trader',
      externalId: 'user-1',
      preferredAffiliateCode: 'GOAT15', // sanitized to ^[A-Za-z0-9]{3,20}$
    });
    expect(typeof payload.password).toBe('string');
    expect(payload.password.length).toBeGreaterThanOrEqual(8);
    expect(payload.metadata).toMatchObject({ dfApplicationId: 'app-9' });
    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith('app-9', {
      platformPartnerId: 'partner-123',
      platformStatus: 'PENDING',
    });
  });

  it('skips registration when the user is missing a name/email', async () => {
    mockIsRegEnabled.mockReturnValue(true);
    mockCreateAffiliateApplication.mockResolvedValue(persisted({ creatorId: 'user-1' }));
    mockGetUserById.mockResolvedValue({ id: 'user-1', email: null, firstName: null });

    await submitApplication({ ...validInput(), creatorId: 'user-1' });
    await flush();

    expect(mockRegisterPartner).not.toHaveBeenCalled();
  });

  it('marks ALREADY_REGISTERED on a 409 conflict', async () => {
    mockIsRegEnabled.mockReturnValue(true);
    mockCreateAffiliateApplication.mockResolvedValue(persisted({ id: 'app-7', creatorId: 'user-1' }));
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'trader@example.com',
      firstName: 'Goat',
      lastName: 'Trader',
    });
    mockRegisterPartner.mockResolvedValue({ alreadyExists: true });

    await submitApplication({ ...validInput(), creatorId: 'user-1' });
    await flush();

    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith('app-7', {
      platformStatus: 'ALREADY_REGISTERED',
    });
  });

  it('still resolves when affiliate-platform registration throws (fire-and-forget)', async () => {
    mockIsRegEnabled.mockReturnValue(true);
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'trader@example.com',
      firstName: 'Goat',
      lastName: 'Trader',
    });
    mockRegisterPartner.mockRejectedValueOnce(new Error('platform down'));

    await expect(
      submitApplication({ ...validInput(), creatorId: 'user-1' })
    ).resolves.toBeDefined();
    await flush();
  });
});

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('handleAffiliateWebhookEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateApplicationPlatformResult.mockResolvedValue(undefined);
  });

  it('marks the application APPROVED on AffiliatePartnerApproved (matched by externalId)', async () => {
    mockFindApplicationForWebhook.mockResolvedValue({ id: 'app-1' });

    await handleAffiliateWebhookEvent('AffiliatePartnerApproved', {
      webhookType: 'AffiliatePartnerApproved',
      externalId: 'user-1',
      partnerId: 'partner-9',
    });

    expect(mockFindApplicationForWebhook).toHaveBeenCalledWith({
      platformPartnerId: 'partner-9',
      creatorId: 'user-1',
    });
    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith('app-1', {
      status: AffiliateApplicationStatus.APPROVED,
      platformStatus: 'AffiliatePartnerApproved',
      platformPartnerId: 'partner-9',
    });
  });

  it('marks the application REJECTED on AffiliatePartnerRejected', async () => {
    mockFindApplicationForWebhook.mockResolvedValue({ id: 'app-2' });

    await handleAffiliateWebhookEvent('AffiliatePartnerRejected', {
      partner: { externalId: 'user-2' },
    });

    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith(
      'app-2',
      expect.objectContaining({ status: AffiliateApplicationStatus.REJECTED })
    );
  });

  it('matches by partnerExternalId (YPF real payload shape)', async () => {
    mockFindApplicationForWebhook.mockResolvedValue({ id: 'app-3' });

    // Real YPF payload: linkage is on `partnerExternalId`, not `externalId`.
    await handleAffiliateWebhookEvent('AffiliatePartnerApproved', {
      approvedBy: 'John',
      partnerId: 'a449ef1a-02c2-4d8c-b00b-a24153f42b19',
      partnerEmail: 'john@example.com',
      partnerExternalId: 'df-user-42',
      webhookType: 'AffiliatePartnerApproved',
      testMode: true,
    });

    expect(mockFindApplicationForWebhook).toHaveBeenCalledWith({
      platformPartnerId: 'a449ef1a-02c2-4d8c-b00b-a24153f42b19',
      creatorId: 'df-user-42',
    });
    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith(
      'app-3',
      expect.objectContaining({ status: AffiliateApplicationStatus.APPROVED })
    );
  });

  it('captures referralCode on AffiliatePartnerRegistered without changing status', async () => {
    mockFindApplicationForWebhook.mockResolvedValue({ id: 'app-r' });

    await handleAffiliateWebhookEvent('AffiliatePartnerRegistered', {
      partnerId: 'partner-9',
      partnerExternalId: 'df-user-7',
      referralCode: 'GOAT15',
      webhookType: 'AffiliatePartnerRegistered',
    });

    expect(mockUpdateApplicationPlatformResult).toHaveBeenCalledWith('app-r', {
      platformStatus: 'AffiliatePartnerRegistered',
      platformPartnerId: 'partner-9',
      referralCode: 'GOAT15',
    });
    // No `status` key — registration must not flip approval.
    expect(mockUpdateApplicationPlatformResult.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('mirrors a coupon on AffiliateCouponApproved', async () => {
    await handleAffiliateWebhookEvent('AffiliateCouponApproved', {
      couponId: 'coupon-1',
      code: 'SAVE20',
      partnerId: 'partner-9',
      partnerExternalId: 'df-user-7',
      discountType: 'percent',
      discountValue: 20,
      webhookType: 'AffiliateCouponApproved',
    });

    expect(mockUpsertAffiliateCoupon).toHaveBeenCalledWith({
      platformCouponId: 'coupon-1',
      code: 'SAVE20',
      status: AffiliateCouponStatus.APPROVED,
      platformPartnerId: 'partner-9',
      creatorId: 'df-user-7',
      discountType: 'percent',
      discountValue: 20,
    });
    // Coupon events never touch the application status.
    expect(mockUpdateApplicationPlatformResult).not.toHaveBeenCalled();
  });

  it('skips a coupon event missing couponId/code', async () => {
    await handleAffiliateWebhookEvent('AffiliateCouponCreated', { partnerId: 'p1' });
    expect(mockUpsertAffiliateCoupon).not.toHaveBeenCalled();
  });

  it('logs and no-ops when no local application matches', async () => {
    mockFindApplicationForWebhook.mockResolvedValue(null);

    await handleAffiliateWebhookEvent('AffiliatePartnerApproved', {
      externalId: 'unknown-user',
    });

    expect(mockUpdateApplicationPlatformResult).not.toHaveBeenCalled();
  });
});

describe('getMyAffiliateStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchPartnerDashboard.mockResolvedValue(null);
  });

  it('returns a not-applied shell when there is no application', async () => {
    mockFindLatestApplicationByCreator.mockResolvedValue(null);
    mockFindCouponsByCreator.mockResolvedValue([]);

    const result = await getMyAffiliateStatus('user-1');

    expect(result).toEqual({
      hasApplied: false,
      status: null,
      isApproved: false,
      preferredCode: null,
      referralCode: null,
      appliedAt: null,
      coupons: [],
      analytics: null,
    });
    // No linked partner id → never hits the affiliate platform.
    expect(mockFetchPartnerDashboard).not.toHaveBeenCalled();
  });

  it('reports approval + referral code + coupons for an approved affiliate', async () => {
    const appliedAt = new Date('2026-06-28T00:00:00.000Z');
    mockFindLatestApplicationByCreator.mockResolvedValue({
      status: AffiliateApplicationStatus.APPROVED,
      preferredAffiliateCode: 'GOAT15',
      referralCode: 'REF123',
      createdAt: appliedAt,
    });
    mockFindCouponsByCreator.mockResolvedValue([
      {
        code: 'SAVE20',
        discountType: 'percent',
        discountValue: 20,
        status: AffiliateCouponStatus.APPROVED,
      },
    ]);

    const result = await getMyAffiliateStatus('user-1');

    expect(result.isApproved).toBe(true);
    expect(result.referralCode).toBe('REF123');
    expect(result.appliedAt).toBe('2026-06-28T00:00:00.000Z');
    expect(result.coupons).toHaveLength(1);
    expect(result.coupons[0]).toMatchObject({ code: 'SAVE20', discountValue: 20 });
  });

  it('merges live analytics when the partner is linked and the fetch succeeds', async () => {
    mockFindLatestApplicationByCreator.mockResolvedValue({
      status: AffiliateApplicationStatus.APPROVED,
      preferredAffiliateCode: 'FLUX',
      referralCode: 'FLUX',
      platformPartnerId: 'partner-uuid-1',
      createdAt: new Date('2026-06-28T00:00:00.000Z'),
    });
    mockFindCouponsByCreator.mockResolvedValue([]);
    const dashboard = {
      tierName: 'Community Affiliate',
      commissionRate: 10,
      totalRevenue: 1200,
      totalCommissions: 120,
      paidCommissions: 50,
      pendingCommissions: 70,
      availablePayoutAmount: 70,
      payoutOnHoldAmount: 0,
      totalOrders: 8,
      paidOrders: 6,
      totalReferralClicks: 340,
      totalReferralClicksLast30Days: 25,
      directReferrals: 4,
    };
    mockFetchPartnerDashboard.mockResolvedValue(dashboard);

    const result = await getMyAffiliateStatus('user-1');

    // Impersonation must use the platform partner UUID, not the DF user id.
    expect(mockFetchPartnerDashboard).toHaveBeenCalledWith('partner-uuid-1');
    expect(result.analytics).toEqual(dashboard);
  });

  it('falls back to null analytics when the dashboard fetch is unavailable', async () => {
    mockFindLatestApplicationByCreator.mockResolvedValue({
      status: AffiliateApplicationStatus.APPROVED,
      preferredAffiliateCode: 'FLUX',
      referralCode: 'FLUX',
      platformPartnerId: 'partner-uuid-1',
      createdAt: new Date('2026-06-28T00:00:00.000Z'),
    });
    mockFindCouponsByCreator.mockResolvedValue([]);
    mockFetchPartnerDashboard.mockResolvedValue(null); // token missing or fetch failed

    const result = await getMyAffiliateStatus('user-1');

    expect(mockFetchPartnerDashboard).toHaveBeenCalledWith('partner-uuid-1');
    expect(result.analytics).toBeNull();
  });
});
