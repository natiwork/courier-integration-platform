import { defineConfig } from 'vitest/config';

// npm test: unit and API tests on in-memory storage. No database needed.
// The PostgreSQL tests in tests/integration have their own config (npm run test:integration).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],
  },
});
