import { apiGet } from './client';
import type { OverviewStats } from './types';

export function getOverviewStats(signal?: AbortSignal): Promise<OverviewStats> {
  return apiGet<OverviewStats>('/api/stats/overview', signal);
}
