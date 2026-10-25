import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import type { WebhookSimulatorService } from '../services/webhookSimulatorService.js';

const SimulateSchema = z.strictObject({
  orderId: z.string('Order id is required').min(1, 'Order id is required'),
  externalStatus: z.string('Courier status is required').min(1, 'Courier status is required'),
});

// Mounted at /api/dev ONLY when WEBHOOK_SIMULATOR is on (default: everywhere except production).
// When it is off these routes don't exist at all (404), and the UI hides the simulator.
export function createDevRouter(simulator: WebhookSimulatorService): Router {
  const router = Router();

  router.get('/webhook-simulator/:orderId', async (req, res) => {
    res.status(200).json({ data: await simulator.options(req.params.orderId) });
  });

  router.post('/webhook-simulator', validateBody(SimulateSchema), async (req, res) => {
    const { orderId, externalStatus } = req.body as z.infer<typeof SimulateSchema>;
    res.status(200).json({ data: await simulator.send(orderId, externalStatus) });
  });

  return router;
}
