// Mirrors the backend domain (backend/src/domain/order.ts and orderStatus.ts). Keep the two in sync.
export const ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'RETURNED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['PAID', 'UNPAID', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  destinationCity: string;
  postalCode: string;
  destinationCountry: string;
  parcelWeightKg: number;
  items: OrderItem[];
  totalCents: number;
  currency: 'EUR';
  paymentStatus: PaymentStatus;
  courierProvider: string | null;
  status: OrderStatus;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}
