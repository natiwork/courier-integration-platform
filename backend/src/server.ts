import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { pendingMigrations } from './db/migrate.js';
import { createPool, type Pool } from './db/pool.js';
import { errorFields, configureLogger, logger } from './lib/logger.js';
import { createProviderRegistry } from './providers/index.js';
import { generateDemoEvents, generateDemoOrders } from './seed/demoOrders.js';
import { createMemoryStorage, createPostgresStorage, type Storage } from './storage.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
configureLogger({ level: config.logLevel });

let pool: Pool | undefined;
let storage: Storage;
if (config.storage === 'postgres') {
  pool = createPool(config.databaseUrl!);
  // Fail at startup, with a hint, rather than on the first request.
  try {
    const pending = await pendingMigrations(pool);
    if (pending.length > 0) {
      logger.error('database schema is not up to date', { pending, hint: 'run npm run db:migrate' });
      process.exit(1);
    }
  } catch (error) {
    logger.error('cannot reach the database', { ...errorFields(error), hint: 'is it running? docker compose up -d db' });
    process.exit(1);
  }
  storage = createPostgresStorage(pool);
} else {
  storage = createMemoryStorage();
}
logger.info('storage ready', { storage: storage.kind });

// Demo orders are written straight to the repository: they need past dates and finished statuses,
// which the service would never create (it always starts at PENDING with the current time).
// tests/seed/demoOrders.test.ts checks that every generated order is still valid and consistent.
if (config.seedDemoData && storage.kind === 'memory') {
  const demoOrders = generateDemoOrders(new Date());
  for (const order of demoOrders) {
    await storage.orderRepository.create(order);
  }
  const demoEvents = generateDemoEvents(demoOrders);
  for (const event of demoEvents) {
    await storage.orderEventRepository.append(event);
  }
  logger.info('demo data seeded', { orders: demoOrders.length, events: demoEvents.length, hint: 'set SEED_DEMO_DATA=false to start empty' });
}

// The mock couriers wait like real network calls here. Log the seed so a run can be repeated.
const providerSeed = config.mockProviderSeed ?? Date.now() % 2 ** 31;
const providerRegistry = createProviderRegistry({ seed: providerSeed, simulateLatency: true });
logger.info('mock courier providers ready', { seed: providerSeed, hint: 'set MOCK_PROVIDER_SEED to repeat a run' });

const server = createApp({
  orderRepository: storage.orderRepository,
  orderEventRepository: storage.orderEventRepository,
  runInTransaction: storage.runInTransaction,
  idempotencyStore: storage.idempotencyStore,
  webhookEventStore: storage.webhookEventStore,
  webhookLog: storage.webhookLog,
  providerRegistry,
  providerTimeoutMs: config.providerTimeoutMs,
  webhookSecrets: config.webhookSecrets,
  webhookSimulator: config.webhookSimulator,
  demoData: config.seedDemoData,
}).listen(config.port, () => {
  logger.info('server listening', { url: `http://localhost:${config.port}`, providerTimeoutMs: config.providerTimeoutMs });
});

// Ctrl+C, `tsx watch` restarts and container stops: finish open requests, then close the database connections.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('shutting down', { signal });
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    });
  });
}
