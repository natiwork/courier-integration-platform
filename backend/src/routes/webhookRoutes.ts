import express, { Router } from 'express';
import type { WebhookService } from '../services/webhookService.js';

// Mounted at /api/webhooks BEFORE express.json(): the signature is computed over the exact bytes the courier
// sent, and parsed-then-reserialized JSON could differ (spacing, key order, escaping). So this route reads
// the raw body as a Buffer, whatever the Content-Type, and parses it only after the signature checks out.
export function createWebhookRouter(webhookService: WebhookService): Router {
  const router = Router();

  router.post('/:providerId', express.raw({ type: () => true, limit: '64kb' }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await webhookService.receive(req.params.providerId, req.headers, rawBody);
    res.status(200).json({ data: result });
  });

  return router;
}
