import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import { generateDemoOrders } from './seed/demoOrders.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const orderRepository = new InMemoryOrderRepository();

// Demo orders are written straight to the repository: they need past dates and finished statuses,
// which the service would never create (it always starts at PENDING with the current time).
// tests/seed/demoOrders.test.ts checks that every generated order is still valid and consistent.
if (config.seedDemoData) {
  const demoOrders = generateDemoOrders(new Date());
  for (const order of demoOrders) {
    await orderRepository.create(order);
  }
  console.log(`Seeded ${demoOrders.length} demo orders (set SEED_DEMO_DATA=false to start empty)`);
}

createApp({ orderRepository, demoData: config.seedDemoData }).listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
