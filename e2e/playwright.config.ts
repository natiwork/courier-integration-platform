import { defineConfig, devices } from '@playwright/test';
import { API_URL, APP_URL, BACKEND_PORT, FRONTEND_PORT } from './tests/support';

// Test-only webhook secrets: they sign the simulated courier updates of this throwaway server. Not real secrets.
const TEST_WEBHOOK_SECRET = 'e2e-only-webhook-secret-'.padEnd(64, 'x');

// npm run test:e2e starts its own backend and frontend on spare ports, so a running `npm run dev` is not disturbed.
export default defineConfig({
  testDir: './tests',
  // One backend serves all tests. A test that creates an order changes the dashboard numbers, so tests run one
  // after another instead of racing each other.
  workers: 1,
  fullyParallel: false,
  // No automatic retries: a flaky test should be visible and fixed, not hidden.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // In memory with the demo seed: fast, no Docker, and every run starts from the same 1,200 orders.
      // Run without --env-file on purpose, so a local backend/.env (e.g. STORAGE=postgres) can't change the test setup.
      command: 'node --import tsx src/server.ts',
      cwd: '../backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'development',
        STORAGE: 'memory',
        SEED_DEMO_DATA: 'true',
        MOCK_PROVIDER_SEED: '42',
        WEBHOOK_SIMULATOR: 'true',
        WEBHOOK_SECRET_SWIFTPARCEL: TEST_WEBHOOK_SECRET,
        WEBHOOK_SECRET_NORDCARGO: TEST_WEBHOOK_SECRET,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: '../frontend',
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});
