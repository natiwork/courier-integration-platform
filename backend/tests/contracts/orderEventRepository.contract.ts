import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderEvent } from '../../src/domain/orderEvent.js';
import type { OrderEventRepository } from '../../src/repositories/orderEventRepository.js';

// What every OrderEventRepository must do (see orderRepository.contract.ts). `fresh` returns an empty event
// repository plus the ids of two existing orders (a database needs real orders for the foreign key).
export function orderEventRepositoryContract(
  name: string,
  fresh: () => Promise<{ events: OrderEventRepository; orderIds: [string, string] }>,
): void {
  describe(`${name} (OrderEventRepository contract)`, () => {
    let events: OrderEventRepository;
    let first: string;
    let second: string;

    beforeEach(async () => {
      const setup = await fresh();
      events = setup.events;
      [first, second] = setup.orderIds;
    });

    function event(overrides: Partial<OrderEvent>): OrderEvent {
      return {
        id: randomUUID(),
        orderId: first,
        type: 'STATUS_CHANGED',
        fromStatus: 'PENDING',
        toStatus: 'PROCESSING',
        source: 'api',
        message: 'Packed',
        providerId: null,
        code: null,
        attempts: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        ...overrides,
      };
    }

    it('stores every field and returns one order\'s history oldest first, ties in the order they were added', async () => {
      const created = event({ type: 'ORDER_CREATED', fromStatus: null, toStatus: 'PENDING', createdAt: '2026-01-01T09:00:00.000Z' });
      const tieA = event({ message: 'first of two at 10:00' });
      const tieB = event({ type: 'SHIPMENT_REJECTED', fromStatus: 'PROCESSING', toStatus: 'FAILED', source: 'provider', providerId: 'nordcargo', code: 'INVALID_ADDRESS', attempts: 3, message: 'second of two at 10:00' });
      await events.append(tieA);
      await events.append(event({ orderId: second }));
      await events.append(tieB);
      await events.append(created);

      expect(await events.findByOrderId(first)).toEqual([created, tieA, tieB]);
      expect(await events.findByOrderId(randomUUID())).toEqual([]);
      expect(await events.findByOrderId('not-a-uuid')).toEqual([]);
    });

    it('lists recent events newest first, filtered by type and time, with ties newest-added first', async () => {
      const old = event({ createdAt: '2026-01-01T08:00:00.000Z' });
      const tieA = event({ type: 'SHIPMENT_CREATED', createdAt: '2026-01-02T08:00:00.000Z' });
      const tieB = event({ type: 'PROVIDER_UNAVAILABLE', orderId: second, createdAt: '2026-01-02T08:00:00.000Z' });
      for (const e of [old, tieA, tieB]) await events.append(e);

      expect(await events.findRecent()).toEqual([tieB, tieA, old]);
      expect(await events.findRecent({ types: ['SHIPMENT_CREATED', 'STATUS_CHANGED'] })).toEqual([tieA, old]);
      expect(await events.findRecent({ since: '2026-01-02T08:00:00.000Z' })).toEqual([tieB, tieA]);
      expect(await events.findRecent({ limit: 1 })).toEqual([tieB]);
    });
  });
}
