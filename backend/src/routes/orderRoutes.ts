import { Router } from 'express';
import { createOrderController } from '../controllers/orderController.js';
import type { IdempotencyStore } from '../idempotency/idempotencyStore.js';
import { idempotency } from '../middleware/idempotency.js';
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
  idempotencyStore: IdempotencyStore,
): Router {
  const router = Router();
  const controller = createOrderController(orderService, shipmentService);

  router.get('/', validateQuery(ListOrdersQuerySchema), controller.list);
  router.get('/:id', controller.getById);
  router.get('/:id/events', controller.events);
  router.get('/:id/tracking', controller.tracking);
  router.post('/', idempotency(idempotencyStore), validateBody(CreateOrderSchema), controller.create);
  router.post('/:id/mark-paid', controller.markPaid);
  router.post('/:id/ship', idempotency(idempotencyStore), validateBody(createShipOrderSchema(providerRegistry)), controller.ship);

  return router;
}
