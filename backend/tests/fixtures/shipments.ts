import type { ShipmentInput } from '../../src/providers/courierProvider.js';

export function shipmentInput(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    orderId: '7b0c3f2e-1d4a-4c6b-9e8f-0a1b2c3d4e5f',
    orderNumber: 'ORD-1001',
    recipientName: 'Freja Jensen',
    address: { street: 'Jægersborggade 12', city: 'Copenhagen', postalCode: '2200', country: 'DK' },
    parcelWeightKg: 2.5,
    service: 'standard',
    ...overrides,
  };
}

// Returns the given values in order, then repeats the last one. Lets a test pick the exact "random" outcome.
export function scriptedRandom(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}
