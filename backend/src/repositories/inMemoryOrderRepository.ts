import type { Order } from '../domain/order.js';
import type { NewOrder, OrderFilter, OrderRepository } from './orderRepository.js';

const FIRST_ORDER_NUMBER = 1001;
const ORDER_NUMBER_PREFIX = 'ORD-';

// Compares numerically: as strings, "ORD-10000" would sort before "ORD-9999".
function orderNumberValue(orderNumber: string): number {
  return Number(orderNumber.slice(ORDER_NUMBER_PREFIX.length));
}

// Keeps orders in a Map. Data is lost on restart; PostgreSQL replaces this in Phase 9.
// Orders contain nested arrays (items), so copies must be deep: callers can never mutate the store.
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = FIRST_ORDER_NUMBER;

  async create(newOrder: NewOrder): Promise<Order> {
    const order: Order = { ...newOrder, orderNumber: `${ORDER_NUMBER_PREFIX}${this.nextOrderNumber}` };
    this.nextOrderNumber += 1;
    this.orders.set(order.id, structuredClone(order));
    return structuredClone(order);
  }

  async findAll(filter: OrderFilter = {}): Promise<Order[]> {
    const search = filter.search?.toLowerCase();
    const matching = [...this.orders.values()].filter(
      (order) =>
        (!filter.status || order.status === filter.status) &&
        (!search ||
          order.orderNumber.toLowerCase().includes(search) ||
          order.customerName.toLowerCase().includes(search) ||
          order.destinationCity.toLowerCase().includes(search)),
    );

    // Newest first. Orders created in the same millisecond share createdAt,
    // so the higher order number wins the tie (same as ORDER BY created_at DESC, order_number DESC).
    return matching
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          orderNumberValue(b.orderNumber) - orderNumberValue(a.orderNumber),
      )
      .slice(0, filter.limit)
      .map((order) => structuredClone(order));
  }

  async findById(id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : null;
  }

  async findByTrackingNumber(trackingNumber: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.trackingNumber === trackingNumber) return structuredClone(order);
    }
    return null;
  }

  async update(order: Order): Promise<Order | null> {
    if (!this.orders.has(order.id)) {
      return null;
    }
    this.orders.set(order.id, structuredClone(order));
    return structuredClone(order);
  }
}
