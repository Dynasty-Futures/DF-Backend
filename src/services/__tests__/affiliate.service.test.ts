import { AffiliateApplicationStatus } from '@prisma/client';
import { submitApplication, SubmitAffiliateApplicationInput } from '../affiliate.service';
import { ValidationError } from '../../utils/errors';

// =============================================================================
// Mocks
// =============================================================================

const mockCreateAffiliateApplication = jest.fn();
const mockUpdateApplicationPlatformResult = jest.fn();
const mockSendAffiliateApplicationNotification = jest.fn();
const mockGetUserById = jest.fn();
const mockIsRegEnabled = jest.fn();
const mockRegisterPartner = jest.fn();

jest.mock('../../repositories/affiliate.repository', () => ({
  createAffiliateApplication: (...args: unknown[]) => mockCreateAffiliateApplication(...args),
  updateApplicationPlatformResult: (...args: unknown[]) =>
    mockUpdateApplicationPlatformResult(...args),
}));

jest.mock('../../repositories/user.repository', () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

jest.mock('../../providers/affiliate/affiliate-platform.client', () => ({
  isAffiliateRegistrationEnabled: () => mockIsRegEnabled(),
  registerPartner: (...args: unknown[]) => mockRegisterPartner(...args),
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
