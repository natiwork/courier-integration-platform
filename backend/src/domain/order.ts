import type { OrderStatus } from './orderStatus.js';

export interface Order {
  id: string; // UUID, used in URLs and as the storage key
  orderNumber: string; // human-readable, sequential: "ORD-1001"
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  destinationCity: string;
  postalCode: string;
  parcelWeightKg: number;
  courierProvider: string | null; // chosen when the order is shipped
  status: OrderStatus;
  trackingNumber: string | null; // issued by the courier provider
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
