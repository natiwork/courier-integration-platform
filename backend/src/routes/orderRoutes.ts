import { Router } from 'express';
import { createOrderController } from '../controllers/orderController.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import type { OrderService } from '../services/orderService.js';
import { CreateOrderSchema, ListOrdersQuerySchema } from '../validation/orderSchemas.js';

// Mounted at /api/orders.
export function createOrderRouter(orderService: OrderService): Router {
  const router = Router();
  const controller = createOrderController(orderService);

  router.get('/', validateQuery(ListOrdersQuerySchema), controller.list);
  router.get('/:id', controller.getById);
  router.post('/', validateBody(CreateOrderSchema), controller.create);

  return router;
}
