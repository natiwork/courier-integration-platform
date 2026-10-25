import { createPool, type Pool } from '../../../src/db/pool.js';

// The integration tests empty their database before every test. Refusing anything not named *_test makes
// sure a mistyped URL can never wipe the development database.
export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile('.env'); // backend/.env; variables already set in the shell win
  } catch {
    // no .env file: the variable must come from the shell (e.g. in CI)
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to backend/.env (see .env.example) and run docker compose up -d db.');
  }
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`TEST_DATABASE_URL must point to a database whose name ends with _test (got "${name}")`);
  }
  return url;
}

export function createTestPool(max = 10): Pool {
  return createPool(testDatabaseUrl(), { max });
}

// RESTART IDENTITY: order numbers start at ORD-1001 again in every test, as in a fresh in-memory store.
export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE orders, order_items, order_events, idempotency_keys, webhook_events, webhook_receipts RESTART IDENTITY CASCADE',
  );
}
