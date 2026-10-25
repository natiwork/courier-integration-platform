import type { CountryCode } from './countries.js';
import type { OrderStatus } from './orderStatus.js';

export const PAYMENT_STATUSES = ['PAID', 'UNPAID', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CURRENCY = 'EUR';

// Tracking numbers of generated demo orders start with this. No courier ever issued them,
// so they can't be looked up with one (see GET /api/orders/:id/tracking).
export const DEMO_TRACKING_PREFIX = 'DEMO-';

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number; // integer cents
}

export interface Order {
  id: string; // UUID, used in URLs and as the storage key
  orderNumber: string; // human-readable, sequential: "ORD-1001"
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  destinationCity: string;
  postalCode: string;
  destinationCountry: CountryCode;
  parcelWeightKg: number;
  items: OrderItem[];
  totalCents: number; // always computed from items, never sent by the client
  currency: typeof CURRENCY;
  paymentStatus: PaymentStatus;
  courierProvider: string | null; // provider id from the registry ("swiftparcel"), chosen when the order ships
  status: OrderStatus;
  trackingNumber: string | null; // issued by the courier provider
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
