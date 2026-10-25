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

export interface IntegrationActivity {
  summary: ProviderActivitySummary[];
  operations: ProviderOperation[];
}

export function getIntegrationActivity(signal?: AbortSignal): Promise<IntegrationActivity> {
  return apiGet<IntegrationActivity>('/api/integrations/activity', signal);
}
