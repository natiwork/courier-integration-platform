import { loadConfig } from '../config/env.js';
import { pendingMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { seedDemoDataIfEmpty } from '../seed/seedDatabase.js';

// npm run db:seed — fills an empty database (DATABASE_URL) with the invented demo orders. Never touches a
// database that already has orders. The server does the same on startup unless SEED_DEMO_DATA=false.
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
  const pending = await pendingMigrations(pool);
  if (pending.length > 0) throw new Error(`The schema is not up to date (${pending.join(', ')}). Run npm run db:migrate first.`);
  const result = await seedDemoDataIfEmpty(pool);
  console.log(
    result.seeded
      ? `Seeded demo data: ${result.orders} orders, ${result.events} events (all invented, labelled as demo data).`
      : 'The database already has orders: nothing was changed.',
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
