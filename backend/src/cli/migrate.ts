import { loadConfig } from '../config/env.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';

// npm run db:migrate — brings the database in DATABASE_URL up to the latest schema.
let databaseUrl: string | undefined;
try {
  databaseUrl = loadConfig().databaseUrl;
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Add it to backend/.env (see .env.example).');
  process.exit(1);
}

const pool = createPool(databaseUrl, { max: 1 });
try {
  const applied = await migrate(pool);
  console.log(applied.length === 0 ? 'Database is up to date.' : `Applied: ${applied.join(', ')}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
