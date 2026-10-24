import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import type { OrderRepository } from './repositories/orderRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import { createOrderRouter } from './routes/orderRoutes.js';
import { OrderService } from './services/orderService.js';

export interface AppOptions {
  // Defaults to a fresh in-memory store, so every createApp() call starts empty.
  orderRepository?: OrderRepository;
}

// Builds the Express app without starting it, so tests can use it without opening a port.
export function createApp(options: AppOptions = {}): Express {
  const orderRepository = options.orderRepository ?? new InMemoryOrderRepository();
  const orderService = new OrderService(orderRepository);

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

  // Must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
