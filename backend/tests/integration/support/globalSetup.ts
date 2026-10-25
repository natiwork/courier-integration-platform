import { migrate } from '../../../src/db/migrate.js';
import { createPool } from '../../../src/db/pool.js';
import { testDatabaseUrl } from './db.js';

// Runs once before all integration tests: creates the test database if it doesn't exist yet and brings its
// schema up to date with the same migrations as development.
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1); // checked by testDatabaseUrl(): [a-z0-9_]+_test

  const server = new URL(url);
  server.pathname = '/postgres'; // the maintenance database every PostgreSQL server has
  const admin = createPool(server.toString(), { max: 1 });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    // CREATE DATABASE can't take a parameter; the name was checked against a strict pattern above.
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const pool = createPool(url, { max: 1 });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
