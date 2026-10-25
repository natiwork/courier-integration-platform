import type { ReactNode } from 'react';
import { getCouriers } from '../api/couriers';
import { useApi } from '../hooks/useApi';
import { CouriersContext } from './couriersContext';

export function CouriersProvider({ children }: { children: ReactNode }) {
  const couriers = useApi((signal) => getCouriers(signal), 'couriers');
  return <CouriersContext.Provider value={couriers}>{children}</CouriersContext.Provider>;
}
