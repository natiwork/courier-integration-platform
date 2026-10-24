import { Router } from 'express';
import { createOrderController } from '../controllers/orderController.js';
import { validateBody } from '../middleware/validate.js';
import type { OrderService } from '../services/orderService.js';
import { CreateOrderSchema } from '../validation/orderSchemas.js';

// Mounted at /api/orders.
export function createOrderRouter(orderService: OrderService): Router {
  const router = Router();
  const controller = createOrderController(orderService);

  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.post('/', validateBody(CreateOrderSchema), controller.create);

  return router;
}
