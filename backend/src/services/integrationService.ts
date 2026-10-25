import { PROVIDER_EVENT_TYPES, type OrderEvent, type OrderEventType } from '../domain/orderEvent.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import type { OrderEventRepository } from '../repositories/orderEventRepository.js';
import type { OrderRepository } from '../repositories/orderRepository.js';

export type OperationOutcome = 'succeeded' | 'rejected' | 'unavailable' | 'timedOut';

const OUTCOMES: Partial<Record<OrderEventType, OperationOutcome>> = {
  SHIPMENT_CREATED: 'succeeded',
  SHIPMENT_REJECTED: 'rejected',
  PROVIDER_UNAVAILABLE: 'unavailable',
  PROVIDER_TIMEOUT: 'timedOut',
};

export interface ProviderOperation {
  id: string; // the event id
  createdAt: string;
  providerId: string;
  providerName: string;
  outcome: OperationOutcome;
  code: string | null;
  message: string;
  orderId: string;
  orderNumber: string | null; // null if the order no longer exists
  attempts: number | null; // how many calls it took, e.g. 3 = succeeded after two temporary failures
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

const RECENT_LIMIT = 50;

// Calls made to couriers, read from the order history. Only real calls are recorded as provider events:
// the demo history is generated (source "system"), so it never shows up here.
export class IntegrationService {
  constructor(
    private readonly events: OrderEventRepository,
    private readonly orders: OrderRepository,
    private readonly registry: ProviderRegistry,
  ) {}

  async getActivity(): Promise<IntegrationActivity> {
    const all = await this.events.findRecent({ types: PROVIDER_EVENT_TYPES });
    const nameOf = (id: string) => (this.registry.has(id) ? this.registry.get(id).name : id);

    const summary = this.registry.list().map((provider): ProviderActivitySummary => {
      const own = all.filter((event) => event.providerId === provider.id);
      const count = (outcome: OperationOutcome) => own.filter((event) => OUTCOMES[event.type] === outcome).length;
      return {
        providerId: provider.id,
        providerName: provider.name,
        succeeded: count('succeeded'),
        rejected: count('rejected'),
        unavailable: count('unavailable'),
        timedOut: count('timedOut'),
        lastOperationAt: own[0]?.createdAt ?? null, // newest first
      };
    });

    const operations = await Promise.all(
      all.slice(0, RECENT_LIMIT).map(async (event: OrderEvent): Promise<ProviderOperation> => {
        const order = await this.orders.findById(event.orderId);
        const providerId = event.providerId ?? 'unknown';
        return {
          id: event.id,
          createdAt: event.createdAt,
          providerId,
          providerName: nameOf(providerId),
          outcome: OUTCOMES[event.type]!,
          code: event.code,
          message: event.message,
          orderId: event.orderId,
          orderNumber: order?.orderNumber ?? null,
          attempts: event.attempts,
        };
      }),
    );

    return { summary, operations };
  }
}
