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

// Orders store a provider id ("nordcargo"); this turns it into the name the registry reports ("NordCargo").
// Until the list has loaded, or if it failed, the id itself is shown rather than nothing.
export function useCourierName(): (id: string) => string {
  const { data } = useCouriers();
  return (id) => data?.find((courier) => courier.id === id)?.name ?? id;
}
