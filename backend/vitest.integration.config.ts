import { defineConfig } from 'vitest/config';

// npm run test:integration: tests against a real PostgreSQL (TEST_DATABASE_URL, a separate *_test database).
// docker compose up -d db must be running.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/support/globalSetup.ts'],
    // All files share one database and empty it before each test, so they must not run at the same time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
