import { Router } from 'express';
import { createOrderController } from '../controllers/orderController.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import type { OrderService } from '../services/orderService.js';
import type { ShipmentService } from '../services/shipmentService.js';
import { CreateOrderSchema, ListOrdersQuerySchema } from '../validation/orderSchemas.js';
import { createShipOrderSchema } from '../validation/shipmentSchemas.js';

// Mounted at /api/orders.
export function createOrderRouter(
  orderService: OrderService,
  shipmentService: ShipmentService,
  providerRegistry: ProviderRegistry,
): Router {
  const router = Router();
  const controller = createOrderController(orderService, shipmentService);

  router.get('/', validateQuery(ListOrdersQuerySchema), controller.list);
  router.get('/:id', controller.getById);
  router.get('/:id/events', controller.events);
  router.get('/:id/tracking', controller.tracking);
  router.post('/', validateBody(CreateOrderSchema), controller.create);
  router.post('/:id/ship', validateBody(createShipOrderSchema(providerRegistry)), controller.ship);

  return router;
}
