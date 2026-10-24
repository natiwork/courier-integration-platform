import { describe, expect, it } from 'vitest';
import { canTransition, ORDER_STATUSES, type OrderStatus } from '../../src/domain/orderStatus.js';

// Written out by hand on purpose: if the table in src changes by mistake, these tests catch it.
const allowed: [OrderStatus, OrderStatus][] = [
  ['PENDING', 'PROCESSING'],
  ['PENDING', 'CANCELLED'],
  ['PROCESSING', 'SHIPPED'],
  ['PROCESSING', 'FAILED'],
  ['SHIPPED', 'IN_TRANSIT'],
  ['SHIPPED', 'FAILED'],
  ['IN_TRANSIT', 'DELIVERED'],
  ['IN_TRANSIT', 'FAILED'],
  ['FAILED', 'PROCESSING'],
  ['FAILED', 'CANCELLED'],
];

describe('canTransition', () => {
  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('allows nothing else', () => {
    const allowedKeys = new Set(allowed.map(([from, to]) => `${from}->${to}`));
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (!allowedKeys.has(`${from}->${to}`)) {
          expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
        }
      }
    }
  });

  it.each([
    ['PENDING', 'SHIPPED'],
    ['PENDING', 'DELIVERED'],
    ['SHIPPED', 'PROCESSING'],
    ['PROCESSING', 'CANCELLED'],
    ['IN_TRANSIT', 'CANCELLED'],
  ] as [OrderStatus, OrderStatus][])('forbids skipping or going back: %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it.each(['DELIVERED', 'CANCELLED'] as OrderStatus[])('treats %s as final', (from) => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition(from, to)).toBe(false);
    }
  });

  it.each([...ORDER_STATUSES])('forbids staying in the same status: %s', (status) => {
    expect(canTransition(status, status)).toBe(false);
  });
});
