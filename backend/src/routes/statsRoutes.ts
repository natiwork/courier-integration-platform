import { Router } from 'express';
import { createStatsController } from '../controllers/statsController.js';
import type { StatsService } from '../services/statsService.js';

// Mounted at /api/stats.
export function createStatsRouter(statsService: StatsService): Router {
  const router = Router();
  const controller = createStatsController(statsService);

  router.get('/overview', controller.overview);

  return router;
}
