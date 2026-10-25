import type { OrderStatus } from './orderStatus.js';

// One entry in an order's history. Every status change writes one, so the history is an audit log:
// what happened, when, who caused it and, for courier calls, what the courier answered.
export const ORDER_EVENT_TYPES = [
  'ORDER_CREATED',
  'STATUS_CHANGED',
  'SHIPMENT_CREATED', // the courier accepted the parcel
  'SHIPMENT_REJECTED', // the courier said no (permanent error)
  'PROVIDER_UNAVAILABLE', // the courier could not be reached or asked to try later (transient error)
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

// Events that record a call to a courier: what the Integrations page lists.
export const PROVIDER_EVENT_TYPES: readonly OrderEventType[] = ['SHIPMENT_CREATED', 'SHIPMENT_REJECTED', 'PROVIDER_UNAVAILABLE'];

// Who caused the change: our API, a courier's answer, a courier's webhook (Phase 8) or the system itself.
export type EventSource = 'api' | 'provider' | 'webhook' | 'system';

export interface OrderEvent {
  id: string;
  orderId: string;
  type: OrderEventType;
  fromStatus: OrderStatus | null; // null only for ORDER_CREATED
  toStatus: OrderStatus;
  source: EventSource;
  message: string;
  providerId: string | null; // set when a courier was involved
  code: string | null; // the courier's error code, e.g. "INVALID_ADDRESS"
  createdAt: string; // ISO 8601
}
