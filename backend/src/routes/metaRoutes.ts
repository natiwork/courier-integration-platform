import { Router } from 'express';
import { createMetaController, type Features } from '../controllers/metaController.js';

// Mounted at /api/meta.
export function createMetaRouter(features: Features): Router {
  const router = Router();
  const controller = createMetaController(features);

  router.get('/order-form', controller.orderForm);
  router.get('/features', controller.features);

  return router;
}
