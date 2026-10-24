import type { Order } from '../domain/order.js';
import type { NewOrder, OrderRepository } from './orderRepository.js';

const FIRST_ORDER_NUMBER = 1001;

// Keeps orders in a Map. Data is lost on restart; PostgreSQL replaces this in Phase 9.
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = FIRST_ORDER_NUMBER;

  async create(newOrder: NewOrder): Promise<Order> {
    const order: Order = { ...newOrder, orderNumber: `ORD-${this.nextOrderNumber}` };
    this.nextOrderNumber += 1;
    this.orders.set(order.id, order);
    return { ...order };
  }

  async findAll(): Promise<Order[]> {
    // Map keeps insertion order, so reversing puts the latest insert first.
    // The sort is stable, so orders created in the same millisecond keep that order.
    return [...this.orders.values()]
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({ ...order }));
  }

  async findById(id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order ? { ...order } : null;
  }

  async update(order: Order): Promise<Order | null> {
    if (!this.orders.has(order.id)) {
      return null;
    }
    this.orders.set(order.id, { ...order });
    return { ...order };
  }
}
