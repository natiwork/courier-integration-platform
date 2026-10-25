import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { OrderService } from '../../src/services/orderService.js';
import { ShipmentService } from '../../src/services/shipmentService.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder } from '../fixtures/orders.js';

function setup() {
  const fake = new FakeProvider();
  const registry = new ProviderRegistry();
  registry.register(fake);
  const repository = new InMemoryOrderRepository();
  const events = new InMemoryOrderEventRepository();
  const orders = new OrderService(repository, events);
  return { fake, repository, events, shipments: new ShipmentService(orders, registry) };
}

describe('ShipmentService', () => {
  // Called directly, both requests read the order before either takes the lock (over HTTP the second request
  // usually arrives late enough to see the lock already taken, so this is the stricter test).
  it('lets only one of two simultaneous ship requests take the lock and call the courier', async () => {
    const t = setup();
    const { orderNumber: _n, ...order } = buildOrder({ id: 'race-1', paymentStatus: 'PAID' });
    await t.repository.create(order);

    const results = await Promise.allSettled([
      t.shipments.ship('race-1', { providerId: 'fake', service: 'standard' }),
      t.shipments.ship('race-1', { providerId: 'fake', service: 'standard' }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({ code: 'SHIPMENT_IN_PROGRESS' });
    expect(t.fake.calls).toHaveLength(1);
    expect((await t.events.findByOrderId('race-1')).map((event) => event.toStatus)).toEqual(['PROCESSING', 'SHIPPED']);
  });

  // The status doesn't change when an order being prepared starts shipping, so only the lock itself can stop
  // the second request here.
  it('does the same for an order that is already PROCESSING (being prepared)', async () => {
    const t = setup();
    const { orderNumber: _n, ...order } = buildOrder({ id: 'race-2', status: 'PROCESSING', paymentStatus: 'PAID' });
    await t.repository.create(order);

    const results = await Promise.allSettled([
      t.shipments.ship('race-2', { providerId: 'fake', service: 'standard' }),
      t.shipments.ship('race-2', { providerId: 'fake', service: 'standard' }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({ code: 'SHIPMENT_IN_PROGRESS' });
    expect(t.fake.calls).toHaveLength(1);
  });
});
