import { apiGet } from './client';

// Mirrors CourierSummary in backend/src/services/courierService.ts — keep in sync.
export interface CourierServiceLevel {
  id: string;
  name: string;
}

export interface CourierCapabilities {
  maxParcelWeightKg: number;
  supportedCountries: string[];
  services: CourierServiceLevel[];
  addressValidation: boolean;
}

export interface CourierHealth {
  status: 'up' | 'down';
  latencyMs: number;
  checkedAt: string;
  simulated: true; // every provider is a mock: the check never leaves the backend
  note: string;
}

export interface Courier {
  id: string; // stored on orders as courierProvider
  name: string;
  mock: true;
  capabilities: CourierCapabilities;
  health: CourierHealth;
}

export function getCouriers(signal?: AbortSignal): Promise<Courier[]> {
  return apiGet<Courier[]>('/api/couriers', signal);
}
