import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import type { OrderRepository } from './repositories/orderRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import { createMetaRouter } from './routes/metaRoutes.js';
import { createOrderRouter } from './routes/orderRoutes.js';
import { createStatsRouter } from './routes/statsRoutes.js';
import { OrderService } from './services/orderService.js';
import { StatsService } from './services/statsService.js';

export interface AppOptions {
  // Defaults to a fresh in-memory store, so every createApp() call starts empty.
  orderRepository?: OrderRepository;
  // True when the store was filled by the demo seed; reported by /api/stats/overview.
  demoData?: boolean;
  // Injectable clock for tests.
  now?: () => Date;
}

// Builds the Express app without starting it, so tests can use it without opening a port.
export function createApp(options: AppOptions = {}): Express {
  const orderRepository = options.orderRepository ?? new InMemoryOrderRepository();
  const orderService = new OrderService(orderRepository, options.now);
  const statsService = new StatsService(orderRepository, { now: options.now, demoData: options.demoData });

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

  app.use('/api/orders', createOrderRouter(orderService));
  app.use('/api/stats', createStatsRouter(statsService));
  app.use('/api/meta', createMetaRouter());

  // Must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
