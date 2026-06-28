import { KycStatus } from '@prisma/client';
import { mapYpfKycStatus, syncUserKyc, requestKyc } from '../kyc.service';

const mockGetUserById = jest.fn();
const mockUpdateKycStatus = jest.fn();
jest.mock('../../repositories/user.repository', () => ({
  getUserById: (...a: unknown[]) => mockGetUserById(...a),
  updateKycStatus: (...a: unknown[]) => mockUpdateKycStatus(...a),
}));

const mockGetUser = jest.fn();
const mockRequestKyc = jest.fn();
jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    getUser: (...a: unknown[]) => mockGetUser(...a),
    requestKyc: (...a: unknown[]) => mockRequestKyc(...a),
  }),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('mapYpfKycStatus', () => {
  it.each([
    ['None', KycStatus.NOT_STARTED],
    ['', KycStatus.NOT_STARTED],
    [undefined, KycStatus.NOT_STARTED],
    ['Pending', KycStatus.PENDING],
    ['pending', KycStatus.PENDING],
    ['inProgress', KycStatus.PENDING],
    ['Approved', KycStatus.APPROVED],
    ['completed', KycStatus.APPROVED],
    ['Rejected', KycStatus.REJECTED],
    ['declined', KycStatus.REJECTED],
    ['somethingWeird', KycStatus.NOT_STARTED],
  ])('maps %s → %s', (raw, expected) => {
    expect(mapYpfKycStatus(raw as string | undefined)).toBe(expected);
  });
});

describe('syncUserKyc', () => {
  it('throws when the user is missing', async () => {
    mockGetUserById.mockResolvedValue(null);
    await expect(syncUserKyc('u1')).rejects.toThrow('User not found');
  });

  it('returns last-known status (linked:false) when not on YPF yet', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: null,
      kycStatus: KycStatus.NOT_STARTED,
    });
    const res = await syncUserKyc('u1');
    expect(res).toEqual({ status: KycStatus.NOT_STARTED, linked: false });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('persists a changed status from YPF', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: 'ypf-1',
      kycStatus: KycStatus.NOT_STARTED,
    });
    mockGetUser.mockResolvedValue({ platformUserId: 'ypf-1', kycStatus: 'Pending' });

    const res = await syncUserKyc('u1');

    expect(mockUpdateKycStatus).toHaveBeenCalledWith('u1', KycStatus.PENDING);
    expect(res).toEqual({ status: KycStatus.PENDING, linked: true });
  });

  it('does not write when the mapped status is unchanged', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: 'ypf-1',
      kycStatus: KycStatus.PENDING,
    });
    mockGetUser.mockResolvedValue({ platformUserId: 'ypf-1', kycStatus: 'Pending' });

    await syncUserKyc('u1');
    expect(mockUpdateKycStatus).not.toHaveBeenCalled();
  });

  it('falls back to local status when YPF is unreachable', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: 'ypf-1',
      kycStatus: KycStatus.APPROVED,
    });
    mockGetUser.mockRejectedValue(new Error('YPF down'));

    const res = await syncUserKyc('u1');
    expect(res).toEqual({ status: KycStatus.APPROVED, linked: true });
    expect(mockUpdateKycStatus).not.toHaveBeenCalled();
  });
});

describe('requestKyc', () => {
  it('rejects when the user has no YPF account', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: null,
      kycStatus: KycStatus.NOT_STARTED,
    });
    await expect(requestKyc('u1')).rejects.toThrow('trading account');
    expect(mockRequestKyc).not.toHaveBeenCalled();
  });

  it('requests on YPF then returns the refreshed status', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      platformUserId: 'ypf-1',
      kycStatus: KycStatus.NOT_STARTED,
    });
    mockRequestKyc.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ platformUserId: 'ypf-1', kycStatus: 'Pending' });

    const res = await requestKyc('u1');

    expect(mockRequestKyc).toHaveBeenCalledWith('ypf-1');
    expect(res).toEqual({ status: KycStatus.PENDING, linked: true });
  });
});
