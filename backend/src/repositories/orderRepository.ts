import type { Order } from '../domain/order.js';
import type { OrderStatus } from '../domain/orderStatus.js';

// Everything except orderNumber, which the storage assigns (a counter now, a PostgreSQL sequence later).
export type NewOrder = Omit<Order, 'orderNumber'>;

export interface OrderFilter {
  // Case-insensitive substring of orderNumber, customerName or destinationCity.
  search?: string;
  status?: OrderStatus;
  limit?: number;
}

export interface OrderRepository {
  create(order: NewOrder): Promise<Order>;
  // Newest first. Filtering lives here so a database can do it in the query (WHERE ... ILIKE, LIMIT).
  findAll(filter?: OrderFilter): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  // Couriers refer to shipments by tracking number (webhooks).
  findByTrackingNumber(trackingNumber: string): Promise<Order | null>;
  // Returns null if the order does not exist.
  update(order: Order): Promise<Order | null>;
}
