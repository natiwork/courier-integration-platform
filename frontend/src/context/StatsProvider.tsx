import type { ReactNode } from 'react';
import { getOverviewStats } from '../api/stats';
import { useApi } from '../hooks/useApi';
import { StatsContext } from './statsContext';

export function StatsProvider({ children }: { children: ReactNode }) {
  const stats = useApi((signal) => getOverviewStats(signal), 'overview-stats');
  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>;
}
