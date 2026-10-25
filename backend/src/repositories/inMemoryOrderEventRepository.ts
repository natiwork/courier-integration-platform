import type { OrderEvent } from '../domain/orderEvent.js';
import type { OrderEventRepository, RecentEventsFilter } from './orderEventRepository.js';

// Keeps events in an array in the order they were appended. PostgreSQL replaces this in Phase 9.
export class InMemoryOrderEventRepository implements OrderEventRepository {
  private readonly events: OrderEvent[] = [];

  async append(event: OrderEvent): Promise<OrderEvent> {
    this.events.push(structuredClone(event));
    return structuredClone(event);
  }

  async findByOrderId(orderId: string): Promise<OrderEvent[]> {
    // Sorted by time; for equal timestamps the append order wins (sort is stable).
    return this.events
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((event) => structuredClone(event));
  }

  async findRecent(filter: RecentEventsFilter = {}): Promise<OrderEvent[]> {
    const { types, since, limit } = filter;
    const indexed = this.events.map((event, index) => ({ event, index }));
    return indexed
      .filter(({ event }) => (!types || types.includes(event.type)) && (!since || event.createdAt >= since))
      .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt) || b.index - a.index)
      .slice(0, limit)
      .map(({ event }) => structuredClone(event));
  }
}
