import type { RequestHandler } from 'express';
import type { StatsService } from '../services/statsService.js';

export function createStatsController(statsService: StatsService) {
  const overview: RequestHandler = async (_req, res) => {
    const stats = await statsService.getOverview();
    res.status(200).json({ data: stats });
  };

  return { overview };
}
