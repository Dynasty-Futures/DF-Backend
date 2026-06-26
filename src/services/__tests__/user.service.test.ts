import { ensurePlatformUserAsync } from '../user.service';

// =============================================================================
// Mocks
// =============================================================================

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockCreateUser = jest.fn();
const mockAccountTypeFindFirst = jest.fn();

jest.mock('../../utils/database', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    accountType: {
      findFirst: (...args: unknown[]) => mockAccountTypeFindFirst(...args),
    },
  },
}));

jest.mock('../../providers/index', () => ({
  getTradingPlatformProvider: () => ({
    createUser: (...args: unknown[]) => mockCreateUser(...args),
  }),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/index', () => ({
  config: { ypf: { autoCreateUsers: false } },
}));

import { config } from '../../config/index';

const setGate = (on: boolean): void => {
  (config as unknown as { ypf: { autoCreateUsers: boolean } }).ypf.autoCreateUsers =
    on;
};

// Flush the detached fire-and-forget promise chain (a couple of macrotask ticks
// to let the chained awaits settle).
const flush = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const dfUser = {
  id: 'df-user-1',
  email: 'trader@example.com',
  firstName: 'Sam',
  lastName: 'Tester',
  phone: null,
  platformUserId: null,
};

describe('ensurePlatformUserAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setGate(false);
    // A seeded YPF-linked program is available by default.
    mockAccountTypeFindFirst.mockResolvedValue({ ypfProgramId: 'prog-50k' });
  });

  it('is a no-op when the gate is off (never touches the DB or YPF)', async () => {
    setGate(false);

    ensurePlatformUserAsync('df-user-1');
    await flush();

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('creates the YPF user (with our id as externalId) and stores platformUserId', async () => {
    setGate(true);
    mockFindUnique.mockResolvedValueOnce(dfUser);
    mockCreateUser.mockResolvedValueOnce({ platformUserId: 'ypf-1' });
    mockUpdate.mockResolvedValueOnce({});

    ensurePlatformUserAsync('df-user-1');
    await flush();

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'trader@example.com',
        firstName: 'Sam',
        lastName: 'Tester',
        externalId: 'df-user-1',
        programId: 'prog-50k',
        tradeServer: 'Volumetrica',
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'df-user-1' },
        data: { platformUserId: 'ypf-1' },
      }),
    );
  });

  it('never throws and skips the update when YPF user creation fails', async () => {
    setGate(true);
    mockFindUnique.mockResolvedValueOnce(dfUser);
    mockCreateUser.mockRejectedValueOnce(new Error('YPF unavailable'));

    expect(() => ensurePlatformUserAsync('df-user-1')).not.toThrow();
    await flush();

    expect(mockCreateUser).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not re-link a user that already has a platformUserId', async () => {
    setGate(true);
    mockFindUnique.mockResolvedValueOnce({
      ...dfUser,
      platformUserId: 'ypf-existing',
    });

    ensurePlatformUserAsync('df-user-1');
    await flush();

    // createPlatformUser throws ConflictError; the wrapper swallows it.
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
