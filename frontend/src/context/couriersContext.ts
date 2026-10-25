import { createContext, useContext } from 'react';
import type { Courier } from '../api/couriers';
import type { ApiState } from '../hooks/useApi';

// One /api/couriers request shared by the Couriers page and every place that shows a courier's name.
export const CouriersContext = createContext<ApiState<Courier[]> | null>(null);

export function useCouriers(): ApiState<Courier[]> {
  const couriers = useContext(CouriersContext);
  if (!couriers) throw new Error('useCouriers must be used inside <CouriersProvider>');
  return couriers;
}
