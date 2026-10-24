import { createContext, useContext } from 'react';
import type { OverviewStats } from '../api/types';
import type { ApiState } from '../hooks/useApi';

// One /api/stats/overview request shared by the top bar (attention counter, demo label) and the Overview page.
export const StatsContext = createContext<ApiState<OverviewStats> | null>(null);

export function useStats(): ApiState<OverviewStats> {
  const stats = useContext(StatsContext);
  if (!stats) throw new Error('useStats must be used inside <StatsProvider>');
  return stats;
}
