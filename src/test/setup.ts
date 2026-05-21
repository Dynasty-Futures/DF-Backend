// =============================================================================
// Jest Test Setup
// =============================================================================

// Set test environment variables. These are set BEFORE the app's dotenv.config()
// runs, which means they take precedence over the developer's local .env — the
// test suite stays self-contained regardless of whose machine it runs on.
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/dynasty_futures_test';
process.env['TRADING_PLATFORM'] = 'ypf';
process.env['FRONTEND_URL'] = 'http://localhost:8080';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global setup
beforeAll(async () => {
  // Add any global setup here
});

// Global teardown
afterAll(async () => {
  // Add any global cleanup here
});
