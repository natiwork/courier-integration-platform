import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewOrder, OrderRepository } from '../../src/repositories/orderRepository.js';
import { buildOrder } from '../fixtures/orders.js';

// What every OrderRepository must do, whatever stores the data. Run against the in-memory store by npm test
// (tests/repositories) and against PostgreSQL by npm run test:integration, so both behave the same.
// `fresh` must return an empty repository whose order numbers start at ORD-1001.
export function orderRepositoryContract(name: string, fresh: () => Promise<OrderRepository>): void {
  describe(`${name} (OrderRepository contract)`, () => {
    let repository: OrderRepository;

    beforeEach(async () => {
      repository = await fresh();
    });

    function newOrder(overrides: Partial<NewOrder> = {}): NewOrder {
      const { orderNumber: _ignored, ...order } = buildOrder({ id: randomUUID(), ...overrides });
      return { ...order, ...overrides };
    }

    it('stores an order with all its fields and items and hands out sequential order numbers', async () => {
      const first = newOrder({
        parcelWeightKg: 2.4,
        // 50 × 999 × €100,000: too big for a 32-bit integer of cents
        totalCents: 499_500_000_000,
        items: [
          { sku: 'B-2', name: 'Second entered first', quantity: 2, unitPriceCents: 1250 },
          { sku: 'A-1', name: 'Ünïcödé name', quantity: 1, unitPriceCents: 499 },
        ],
        trackingNumber: 'SP0000000001',
        courierProvider: 'swiftparcel',
        createdAt: '2026-01-01T10:00:00.123Z',
        updatedAt: '2026-01-02T11:30:00.456Z',
      });
      const created = await repository.create(first);
      const second = await repository.create(newOrder());

      expect(created).toEqual({ ...first, orderNumber: 'ORD-1001' });
      expect(second.orderNumber).toBe('ORD-1002');
      expect(await repository.findById(first.id)).toEqual(created);
    });

    it('finds nothing for an unknown id or an id that is not even a UUID', async () => {
      expect(await repository.findById(randomUUID())).toBeNull();
      expect(await repository.findById('not-a-uuid')).toBeNull();
    });

    it('lists newest first, breaking createdAt ties by the higher order number', async () => {
      const sameTime = '2026-03-01T12:00:00.000Z';
      const a = await repository.create(newOrder({ createdAt: sameTime }));
      const b = await repository.create(newOrder({ createdAt: sameTime }));
      const old = await repository.create(newOrder({ createdAt: '2026-01-01T00:00:00.000Z' }));
      const latest = await repository.create(newOrder({ createdAt: '2026-04-01T00:00:00.000Z' }));

      expect((await repository.findAll()).map((order) => order.id)).toEqual([latest.id, b.id, a.id, old.id]);
      expect((await repository.findAll({ limit: 2 })).map((order) => order.id)).toEqual([latest.id, b.id]);
    });

    it('filters by status and searches number, customer and city, ignoring case', async () => {
      const berlin = await repository.create(newOrder({ customerName: 'Lena Vogt', destinationCity: 'Berlin', status: 'SHIPPED' }));
      const paris = await repository.create(newOrder({ customerName: 'Camille Martin', destinationCity: 'Paris' }));

      expect((await repository.findAll({ status: 'SHIPPED' })).map((order) => order.id)).toEqual([berlin.id]);
      expect((await repository.findAll({ search: 'BERL' })).map((order) => order.id)).toEqual([berlin.id]);
      expect((await repository.findAll({ search: 'camille' })).map((order) => order.id)).toEqual([paris.id]);
      expect((await repository.findAll({ search: 'ord-1002' })).map((order) => order.id)).toEqual([paris.id]);
      expect(await repository.findAll({ search: 'Paris', status: 'SHIPPED' })).toEqual([]);
    });

    it('treats % and _ in a search as plain characters', async () => {
      await repository.create(newOrder({ customerName: 'Plain Name' }));
      const special = await repository.create(newOrder({ customerName: '50% Off_Shop' }));

      expect(await repository.findAll({ search: '%' })).toEqual([special]);
      expect((await repository.findAll({ search: '_' })).map((order) => order.id)).toEqual([special.id]);
    });

    it('finds an order by tracking number', async () => {
      const shipped = await repository.create(newOrder({ trackingNumber: 'NC1234567' }));
      expect((await repository.findByTrackingNumber('NC1234567'))?.id).toBe(shipped.id);
      expect(await repository.findByTrackingNumber('NC0000000')).toBeNull();
    });

    describe('update', () => {
      it('applies the changes when the order still matches the expectation', async () => {
        const order = await repository.create(newOrder({ status: 'PENDING' }));

        const updated = await repository.update(order.id, { status: 'PENDING' }, { status: 'PROCESSING', updatedAt: '2026-05-01T00:00:00.000Z' });

        expect(updated).toEqual({ ...order, status: 'PROCESSING', updatedAt: '2026-05-01T00:00:00.000Z' });
        expect(await repository.findById(order.id)).toEqual(updated);
      });

      it('changes nothing and returns null when the order no longer matches', async () => {
        const order = await repository.create(newOrder({ status: 'SHIPPED', paymentStatus: 'PAID' }));

        expect(await repository.update(order.id, { status: 'PENDING' }, { status: 'CANCELLED', updatedAt: '2026-05-01T00:00:00.000Z' })).toBeNull();
        expect(await repository.update(order.id, { status: 'SHIPPED', paymentStatus: 'UNPAID' }, { paymentStatus: 'PAID', updatedAt: '2026-05-01T00:00:00.000Z' })).toBeNull();
        expect(await repository.findById(order.id)).toEqual(order);
      });

      it('compares null as "must be empty" and timestamps by value', async () => {
        const order = await repository.create(newOrder({ status: 'PROCESSING', paymentStatus: 'PAID' }));
        const startedAt = '2026-05-01T08:00:00.001Z';

        const locked = await repository.update(
          order.id,
          { trackingNumber: null, shippingStartedAt: null },
          { shippingStartedAt: startedAt, shippingProviderId: 'swiftparcel', updatedAt: startedAt },
        );
        expect(locked).toMatchObject({ shippingStartedAt: startedAt, shippingProviderId: 'swiftparcel' });
        expect(await repository.update(order.id, { shippingStartedAt: null }, { shippingStartedAt: startedAt, shippingProviderId: 'x', updatedAt: startedAt })).toBeNull();

        const finished = await repository.update(
          order.id,
          { shippingStartedAt: startedAt },
          { status: 'SHIPPED', trackingNumber: 'SP1', courierProvider: 'swiftparcel', shippingStartedAt: null, shippingProviderId: null, updatedAt: '2026-05-01T08:00:01.000Z' },
        );
        expect(finished).toMatchObject({ status: 'SHIPPED', trackingNumber: 'SP1', shippingStartedAt: null, shippingProviderId: null });
      });

      it('returns null for an unknown order', async () => {
        expect(await repository.update(randomUUID(), {}, { status: 'FAILED', updatedAt: '2026-05-01T00:00:00.000Z' })).toBeNull();
        expect(await repository.update('not-a-uuid', {}, { status: 'FAILED', updatedAt: '2026-05-01T00:00:00.000Z' })).toBeNull();
      });
    });

    it('finds ship requests that started before a moment, and only those', async () => {
      const stuck = await repository.create(newOrder({ status: 'PROCESSING', shippingStartedAt: '2026-05-01T08:00:00.000Z', shippingProviderId: 'nordcargo' }));
      await repository.create(newOrder({ status: 'PROCESSING', shippingStartedAt: '2026-05-01T08:09:00.000Z', shippingProviderId: 'nordcargo' }));
      await repository.create(newOrder({ status: 'PROCESSING' })); // being prepared, no ship request

      expect((await repository.findShippingStartedBefore('2026-05-01T08:05:00.000Z')).map((order) => order.id)).toEqual([stuck.id]);
    });
  });
}
