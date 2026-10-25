import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { configureLogger, logger } from './lib/logger.js';
import { createProviderRegistry } from './providers/index.js';
import { InMemoryOrderEventRepository } from './repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import { generateDemoEvents, generateDemoOrders } from './seed/demoOrders.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
configureLogger({ level: config.logLevel });

const orderRepository = new InMemoryOrderRepository();
const orderEventRepository = new InMemoryOrderEventRepository();

// Demo orders are written straight to the repository: they need past dates and finished statuses,
// which the service would never create (it always starts at PENDING with the current time).
// tests/seed/demoOrders.test.ts checks that every generated order is still valid and consistent.
if (config.seedDemoData) {
  const demoOrders = generateDemoOrders(new Date());
  for (const order of demoOrders) {
    await orderRepository.create(order);
  }
  const demoEvents = generateDemoEvents(demoOrders);
  for (const event of demoEvents) {
    await orderEventRepository.append(event);
  }
  logger.info('demo data seeded', { orders: demoOrders.length, events: demoEvents.length, hint: 'set SEED_DEMO_DATA=false to start empty' });
}

// The mock couriers wait like real network calls here. Log the seed so a run can be repeated.
const providerSeed = config.mockProviderSeed ?? Date.now() % 2 ** 31;
const providerRegistry = createProviderRegistry({ seed: providerSeed, simulateLatency: true });
logger.info('mock courier providers ready', { seed: providerSeed, hint: 'set MOCK_PROVIDER_SEED to repeat a run' });

createApp({
  orderRepository,
  orderEventRepository,
  providerRegistry,
  providerTimeoutMs: config.providerTimeoutMs,
  webhookSecrets: config.webhookSecrets,
  webhookSimulator: config.webhookSimulator,
  demoData: config.seedDemoData,
}).listen(config.port, () => {
  logger.info('server listening', { url: `http://localhost:${config.port}`, providerTimeoutMs: config.providerTimeoutMs });
});
