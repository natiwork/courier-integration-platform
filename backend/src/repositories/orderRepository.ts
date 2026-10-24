import type { Order } from '../domain/order.js';

// Everything except orderNumber, which the storage assigns (a counter now, a PostgreSQL sequence later).
export type NewOrder = Omit<Order, 'orderNumber'>;

export interface OrderRepository {
  create(order: NewOrder): Promise<Order>;
  // Newest first.
  findAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  // Returns null if the order does not exist.
  update(order: Order): Promise<Order | null>;
}
