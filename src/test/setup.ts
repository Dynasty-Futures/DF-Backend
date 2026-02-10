// =============================================================================
// Jest Test Setup
// =============================================================================

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/dynasty_futures_test';

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
