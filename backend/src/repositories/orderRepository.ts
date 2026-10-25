import type { Order } from '../domain/order.js';
import type { OrderStatus } from '../domain/orderStatus.js';

// Everything except orderNumber, which the storage assigns (a counter in memory, a sequence in PostgreSQL).
export type NewOrder = Omit<Order, 'orderNumber'>;

export interface OrderFilter {
  // Case-insensitive substring of orderNumber, customerName or destinationCity.
  search?: string;
  status?: OrderStatus;
  limit?: number;
}

// What the order must still look like for an update to happen. Each field is compared exactly (null = must be
// empty). This is how two requests can't both win: the second one finds the order already changed.
export type OrderExpectation = Partial<Pick<Order, 'status' | 'paymentStatus' | 'trackingNumber' | 'shippingStartedAt'>>;

// The fields an update may change. updatedAt always changes with them.
export type OrderChanges = Partial<
  Pick<Order, 'status' | 'paymentStatus' | 'courierProvider' | 'trackingNumber' | 'shippingStartedAt' | 'shippingProviderId'>
> & { updatedAt: string };

export interface OrderRepository {
  create(order: NewOrder): Promise<Order>;
  // Newest first. Filtering lives here so a database can do it in the query (WHERE ... ILIKE, LIMIT).
  findAll(filter?: OrderFilter): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  // Couriers refer to shipments by tracking number (webhooks).
  findByTrackingNumber(trackingNumber: string): Promise<Order | null>;
  // Ship requests that started before this moment and never finished (the process died while waiting).
  findShippingStartedBefore(before: string): Promise<Order[]>;
  // Checks and writes in one step (UPDATE ... WHERE id = $1 AND status = $2 RETURNING *): applies the changes
  // only if the order still matches `expected`. Returns null when the order is missing or no longer matches;
  // nothing is written then.
  update(id: string, expected: OrderExpectation, changes: OrderChanges): Promise<Order | null>;
}
