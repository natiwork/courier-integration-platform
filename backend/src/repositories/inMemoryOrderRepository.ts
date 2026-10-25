import type { Order } from '../domain/order.js';
import type { NewOrder, OrderChanges, OrderExpectation, OrderFilter, OrderRepository } from './orderRepository.js';

const FIRST_ORDER_NUMBER = 1001;
const ORDER_NUMBER_PREFIX = 'ORD-';

// Compares numerically: as strings, "ORD-10000" would sort before "ORD-9999".
function orderNumberValue(orderNumber: string): number {
  return Number(orderNumber.slice(ORDER_NUMBER_PREFIX.length));
}

// Keeps orders in a Map. Data is lost on restart; STORAGE=postgres keeps it in PostgreSQL instead.
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

  async findShippingStartedBefore(before: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.shippingStartedAt !== null && order.shippingStartedAt < before)
      .map((order) => structuredClone(order));
  }

  // The check and the write run without an await in between, so no other request can change the order in the
  // middle (JavaScript runs one piece of code at a time). PostgreSQL gets the same from one UPDATE ... WHERE.
  async update(id: string, expected: OrderExpectation, changes: OrderChanges): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    const matches = (Object.keys(expected) as (keyof OrderExpectation)[]).every(
      (key) => expected[key] === undefined || order[key] === expected[key],
    );
    if (!matches) return null;
    const updated = { ...order, ...changes };
    this.orders.set(id, structuredClone(updated));
    return structuredClone(updated);
  }
}
