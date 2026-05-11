import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  AccountNotFoundError,
  UserNotFoundError,
  AccountSuspendedError,
  RuleViolationError,
  InsufficientFundsError,
  PaymentError,
  PlatformError,
} from '../errors';

// =============================================================================
// Regression: AppError subclass prototype chain
// =============================================================================
// The base class previously called `Object.setPrototypeOf(this, AppError.prototype)`
// which clobbered every subclass — `instanceof UnauthorizedError` etc. always
// returned false, silently breaking error-type guards across the codebase
// (auth.service.ts, volumetrica.client.ts, stripe.service.ts).
//
// This test pins the correct behavior: every subclass must satisfy `instanceof`
// for both itself AND `AppError`.

describe('AppError subclass instanceof checks', () => {
  const cases: ReadonlyArray<readonly [new (...args: never[]) => AppError, string]> = [
    [BadRequestError, 'BadRequestError'],
    [UnauthorizedError, 'UnauthorizedError'],
    [ForbiddenError, 'ForbiddenError'],
    [NotFoundError, 'NotFoundError'],
    [ConflictError, 'ConflictError'],
    [ValidationError, 'ValidationError'],
    [RateLimitError, 'RateLimitError'],
    [InternalError, 'InternalError'],
    [ServiceUnavailableError, 'ServiceUnavailableError'],
    [AuthenticationError, 'AuthenticationError'],
    [TokenExpiredError, 'TokenExpiredError'],
    [InvalidTokenError, 'InvalidTokenError'],
    [AccountNotFoundError, 'AccountNotFoundError'],
    [UserNotFoundError, 'UserNotFoundError'],
    [AccountSuspendedError, 'AccountSuspendedError'],
    [InsufficientFundsError, 'InsufficientFundsError'],
    [PaymentError, 'PaymentError'],
    [PlatformError, 'PlatformError'],
  ];

  it.each(cases)('%s instance satisfies instanceof its own class AND AppError', (Ctor) => {
    const err = new (Ctor as new () => AppError)();
    expect(err).toBeInstanceOf(Ctor);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('RuleViolationError satisfies instanceof (constructor takes args)', () => {
    const err = new RuleViolationError('DAILY_LOSS', 'Loss exceeded');
    expect(err).toBeInstanceOf(RuleViolationError);
    expect(err).toBeInstanceOf(AppError);
  });

  it('subclasses do not falsely satisfy each other', () => {
    const u = new UnauthorizedError();
    expect(u).not.toBeInstanceOf(ForbiddenError);
    expect(u).not.toBeInstanceOf(NotFoundError);
  });
});
