import { Router } from 'express';
import { createIntegrationController } from '../controllers/integrationController.js';
import type { IntegrationService } from '../services/integrationService.js';

// Mounted at /api/integrations.
export function createIntegrationRouter(integrationService: IntegrationService): Router {
  const router = Router();
  const controller = createIntegrationController(integrationService);

  router.get('/activity', controller.activity);

  return router;
}
