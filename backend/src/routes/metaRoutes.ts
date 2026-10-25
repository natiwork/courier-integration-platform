import { Router } from 'express';
import { createMetaController } from '../controllers/metaController.js';

// Mounted at /api/meta.
export function createMetaRouter(): Router {
  const router = Router();
  const controller = createMetaController();

  router.get('/order-form', controller.orderForm);

  return router;
}
