import type { OrderStatus } from '../types/order';
import { apiGet, apiPost } from './client';

// Dev/demo only: the backend registers these routes when WEBHOOK_SIMULATOR is on. Mirrors
// backend/src/services/webhookSimulatorService.ts.
export interface SimulatorOptions {
  orderId: string;
  providerId: string;
  providerName: string;
  trackingNumber: string;
  demo: boolean;
  options: { externalStatus: string; status: OrderStatus }[];
}

export interface SimulatedSend {
  sent: { eventId: string; headers: Record<string, string>; body: unknown };
  result: { status: 'accepted' | 'duplicate' | 'unchanged' | 'ignored'; eventId: string; reason?: string };
}

// null when the simulator is turned off on this server: then its routes don't exist, and we don't even ask.
export async function getSimulatorOptions(orderId: string, signal?: AbortSignal): Promise<SimulatorOptions | null> {
  const features = await apiGet<{ webhookSimulator: boolean }>('/api/meta/features', signal);
  if (!features.webhookSimulator) return null;
  return apiGet<SimulatorOptions>(`/api/dev/webhook-simulator/${encodeURIComponent(orderId)}`, signal);
}

export function sendSimulatedUpdate(orderId: string, externalStatus: string): Promise<SimulatedSend> {
  return apiPost<SimulatedSend>('/api/dev/webhook-simulator', { orderId, externalStatus });
}
