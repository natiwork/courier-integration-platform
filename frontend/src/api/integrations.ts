import type { OrderStatus } from '../types/order';
import { apiGet } from './client';

// Mirrors IntegrationActivity in backend/src/services/integrationService.ts — keep in sync.
export type OperationOutcome = 'succeeded' | 'rejected' | 'unavailable' | 'timedOut';

export interface ProviderOperation {
  id: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  outcome: OperationOutcome;
  code: string | null;
  message: string;
  orderId: string;
  orderNumber: string | null;
  attempts: number | null; // 3 = it worked (or gave up) on the third call
}

export interface ProviderActivitySummary {
  providerId: string;
  providerName: string;
  succeeded: number;
  rejected: number;
  unavailable: number;
  timedOut: number;
  lastOperationAt: string | null;
}

export type WebhookOutcome =
  | 'accepted'
  | 'duplicate'
  | 'unchanged'
  | 'ignored_transition'
  | 'unmapped_status'
  | 'unknown_tracking'
  | 'invalid_signature'
  | 'stale'
  | 'invalid_payload'
  | 'not_configured';

export interface IncomingWebhook {
  id: string;
  receivedAt: string;
  providerId: string;
  providerName: string;
  outcome: WebhookOutcome;
  requestId: string | null;
  eventId: string | null; // null when the signature failed: nothing in the body is trusted then
  trackingNumber: string | null;
  externalStatus: string | null;
  status: OrderStatus | null;
  orderId: string | null;
  orderNumber: string | null;
}

export interface WebhookSummary {
  providerId: string;
  providerName: string;
  counts: Record<WebhookOutcome, number>;
  lastReceivedAt: string | null;
}

export interface IntegrationActivity {
  summary: ProviderActivitySummary[];
  operations: ProviderOperation[];
  webhooks: { summary: WebhookSummary[]; recent: IncomingWebhook[] };
}

export function getIntegrationActivity(signal?: AbortSignal): Promise<IntegrationActivity> {
  return apiGet<IntegrationActivity>('/api/integrations/activity', signal);
}
