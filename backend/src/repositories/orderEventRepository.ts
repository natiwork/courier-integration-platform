import type { OrderEvent, OrderEventType } from '../domain/orderEvent.js';

export interface RecentEventsFilter {
  types?: readonly OrderEventType[];
  since?: string; // ISO 8601, inclusive
  limit?: number;
}

// Events are only ever added, never changed or deleted: the history must stay trustworthy.
export interface OrderEventRepository {
  append(event: OrderEvent): Promise<OrderEvent>;
  // Oldest first: the order's history in the order it happened.
  findByOrderId(orderId: string): Promise<OrderEvent[]>;
  // Newest first, across all orders.
  findRecent(filter?: RecentEventsFilter): Promise<OrderEvent[]>;
}
