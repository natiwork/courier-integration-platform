import type { Order } from '../../src/domain/order.js';

// A valid POST /api/orders body. paymentStatus is left out on purpose: it is optional.
export const validOrderBody = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  deliveryAddress: '12 Analytical Street',
  destinationCity: 'London',
  postalCode: 'N1 9GU',
  destinationCountry: 'GB',
  parcelWeightKg: 2.4,
  items: [
    { sku: 'KIT-POUR-01', name: 'Pour-over set', quantity: 2, unitPriceCents: 1250 },
    { sku: 'FLT-100', name: 'Paper filters', quantity: 1, unitPriceCents: 499 },
  ],
};

// 2 × 12.50 + 1 × 4.99
export const validOrderTotalCents = 2999;

let counter = 0;

// A complete stored order for service and stats tests. Override only what a test cares about.
export function buildOrder(overrides: Partial<Order> = {}): Order {
  counter += 1;
  const createdAt = overrides.createdAt ?? '2026-01-01T10:00:00.000Z';
  return {
    id: `order-${counter}`,
    orderNumber: `ORD-${1000 + counter}`,
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    deliveryAddress: '12 Analytical Street',
    destinationCity: 'London',
    postalCode: 'N1 9GU',
    destinationCountry: 'GB',
    parcelWeightKg: 1,
    items: [{ sku: 'KIT-POUR-01', name: 'Pour-over set', quantity: 1, unitPriceCents: 1000 }],
    totalCents: 1000,
    currency: 'EUR',
    paymentStatus: 'PAID',
    courierProvider: null,
    status: 'PENDING',
    trackingNumber: null,
    shippingStartedAt: null,
    shippingProviderId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
