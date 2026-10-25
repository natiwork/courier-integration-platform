import type { RequestHandler } from 'express';
import type { IntegrationService } from '../services/integrationService.js';

export function createIntegrationController(integrationService: IntegrationService) {
  const activity: RequestHandler = async (_req, res) => {
    const data = await integrationService.getActivity();
    res.status(200).json({ data });
  };

  return { activity };
}
