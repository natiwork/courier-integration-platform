import { Router } from 'express';
import { createCourierController } from '../controllers/courierController.js';
import type { CourierService } from '../services/courierService.js';

// Mounted at /api/couriers.
export function createCourierRouter(courierService: CourierService): Router {
  const router = Router();
  const controller = createCourierController(courierService);

  router.get('/', controller.list);

  return router;
}
