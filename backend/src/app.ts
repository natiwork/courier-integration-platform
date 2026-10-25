import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { createProviderRegistry } from './providers/index.js';
import type { ProviderRegistry } from './providers/providerRegistry.js';
import { InMemoryOrderEventRepository } from './repositories/inMemoryOrderEventRepository.js';
import type { OrderEventRepository } from './repositories/orderEventRepository.js';
import type { OrderRepository } from './repositories/orderRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import { createCourierRouter } from './routes/courierRoutes.js';
import { createIntegrationRouter } from './routes/integrationRoutes.js';
import { createMetaRouter } from './routes/metaRoutes.js';
import { createOrderRouter } from './routes/orderRoutes.js';
import { createStatsRouter } from './routes/statsRoutes.js';
import { CourierService } from './services/courierService.js';
import { IntegrationService } from './services/integrationService.js';
import { OrderService } from './services/orderService.js';
import { ShipmentService } from './services/shipmentService.js';
import { StatsService } from './services/statsService.js';

// Default for tests: fixed seed and no waiting, so every run gives the same answers instantly.
const TEST_PROVIDER_SEED = 1;

export interface AppOptions {
  // Defaults to a fresh in-memory store, so every createApp() call starts empty.
  orderRepository?: OrderRepository;
  // Defaults to a fresh in-memory event log. Pass the one the orders were seeded with.
  orderEventRepository?: OrderEventRepository;
  // Defaults to the mock providers with a fixed seed and no simulated latency.
  providerRegistry?: ProviderRegistry;
  // Deadline for each courier call. Defaults to DEFAULT_PROVIDER_TIMEOUT_MS (2 s).
  providerTimeoutMs?: number;
  // True when the store was filled by the demo seed; reported by /api/stats/overview.
  demoData?: boolean;
  // Injectable clock for tests.
  now?: () => Date;
}

// Builds the Express app without starting it, so tests can use it without opening a port.
export function createApp(options: AppOptions = {}): Express {
  const orderRepository = options.orderRepository ?? new InMemoryOrderRepository();
  const orderEventRepository = options.orderEventRepository ?? new InMemoryOrderEventRepository();
  const orderService = new OrderService(orderRepository, orderEventRepository, options.now);
  const statsService = new StatsService(orderRepository, orderEventRepository, { now: options.now, demoData: options.demoData });
  const providerRegistry =
    options.providerRegistry ??
    createProviderRegistry({ seed: TEST_PROVIDER_SEED, simulateLatency: false, now: options.now });
  const courierService = new CourierService(providerRegistry);
  const shipmentService = new ShipmentService(orderService, providerRegistry, { now: options.now, timeoutMs: options.providerTimeoutMs });
  const integrationService = new IntegrationService(orderEventRepository, orderRepository, providerRegistry);

  const app = express();
  app.disable('x-powered-by');

  // Order matters: requestId first so every later error (including bad JSON) has an id.
  app.use(requestId);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/orders', createOrderRouter(orderService, shipmentService, providerRegistry));
  app.use('/api/stats', createStatsRouter(statsService));
  app.use('/api/meta', createMetaRouter());
  app.use('/api/couriers', createCourierRouter(courierService));
  app.use('/api/integrations', createIntegrationRouter(integrationService));

  // Must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
