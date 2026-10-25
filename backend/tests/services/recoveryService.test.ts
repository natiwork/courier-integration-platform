import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { OrderService } from '../../src/services/orderService.js';
import { RecoveryService } from '../../src/services/recoveryService.js';
import { ShipmentService } from '../../src/services/shipmentService.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder } from '../fixtures/orders.js';

const MINUTE = 60_000;

function setup() {
  let now = new Date('2026-10-25T12:00:00.000Z');
  const clock = () => now;
  const fake = new FakeProvider();
  const registry = new ProviderRegistry();
  registry.register(fake);
  const repository = new InMemoryOrderRepository();
  const events = new InMemoryOrderEventRepository();
  const orders = new OrderService(repository, events, clock);
  return {
    fake,
    repository,
    events,
    orders,
    shipments: new ShipmentService(orders, registry, { now: clock }),
    recovery: new RecoveryService(orders, registry, { now: clock }),
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
    add: async (overrides: Parameters<typeof buildOrder>[0]) => {
      const { orderNumber: _n, ...order } = buildOrder(overrides);
      return repository.create(order);
    },
  };
}

describe('RecoveryService', () => {
  it('closes a ship request left behind for more than 5 minutes: FAILED, lock cleared, one system event', async () => {
    const t = setup();
    await t.add({ id: 'stuck', status: 'PROCESSING', shippingStartedAt: '2026-10-25T11:54:00.000Z', shippingProviderId: 'fake' });

    const recovered = await t.recovery.recoverInterruptedShipments();

    expect(recovered.map((order) => order.id)).toEqual(['stuck']);
    expect(await t.repository.findById('stuck')).toMatchObject({ status: 'FAILED', shippingStartedAt: null, shippingProviderId: null });
    expect(await t.events.findByOrderId('stuck')).toEqual([
      expect.objectContaining({
        type: 'STATUS_CHANGED',
        fromStatus: 'PROCESSING',
        toStatus: 'FAILED',
        source: 'system',
        code: 'SHIPMENT_INTERRUPTED',
        providerId: 'fake',
        message: 'Recovered after interruption: the request to Fake Courier never finished, so no courier answer was recorded. Check with the courier before trying again.',
      }),
    ]);
    // Closed once: running again changes nothing.
    expect(await t.recovery.recoverInterruptedShipments()).toEqual([]);
  });

  it('leaves orders being prepared (PROCESSING without a lock) alone, however old', async () => {
    const t = setup();
    const prepared = await t.add({ id: 'prepared', status: 'PROCESSING', updatedAt: '2026-01-01T00:00:00.000Z' });

    expect(await t.recovery.recoverInterruptedShipments()).toEqual([]);
    expect(await t.repository.findById('prepared')).toEqual(prepared);
    expect(await t.events.findByOrderId('prepared')).toEqual([]);
  });

  it('leaves a ship request alone while it may still be running', async () => {
    const t = setup();
    await t.add({ id: 'fresh', status: 'PROCESSING', shippingStartedAt: '2026-10-25T11:56:00.000Z', shippingProviderId: 'fake' });

    expect(await t.recovery.recoverInterruptedShipments()).toEqual([]);
    expect((await t.repository.findById('fresh'))?.shippingStartedAt).toBe('2026-10-25T11:56:00.000Z');
  });

  it('keeps the recovered history when the courier\'s answer arrives after all (409 SHIPMENT_INTERRUPTED)', async () => {
    const t = setup();
    await t.add({ id: 'late', paymentStatus: 'PAID' });
    let release!: () => void;
    t.fake.gate = new Promise((resolve) => (release = resolve));

    const shipping = t.shipments.ship('late', { providerId: 'fake', service: 'standard' }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(t.fake.calls).toHaveLength(1));
    t.advance(6 * MINUTE);
    await t.recovery.recoverInterruptedShipments();
    release();

    expect(await shipping).toMatchObject({ code: 'SHIPMENT_INTERRUPTED', httpStatus: 409 });
    expect((await t.repository.findById('late'))?.status).toBe('FAILED');
    expect((await t.events.findByOrderId('late')).map((event) => [event.toStatus, event.source])).toEqual([
      ['PROCESSING', 'api'],
      ['FAILED', 'system'],
    ]);
  });

  it('lets a recovered order be shipped again', async () => {
    const t = setup();
    await t.add({ id: 'again', status: 'PROCESSING', paymentStatus: 'PAID', shippingStartedAt: '2026-10-25T11:00:00.000Z', shippingProviderId: 'fake' });
    await t.recovery.recoverInterruptedShipments();

    expect(await t.shipments.ship('again', { providerId: 'fake', service: 'standard' })).toMatchObject({ status: 'SHIPPED', shippingStartedAt: null });
  });
});
