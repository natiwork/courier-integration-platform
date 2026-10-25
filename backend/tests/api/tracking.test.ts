import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createRandom } from '../../src/lib/random.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { SwiftParcelProvider } from '../../src/providers/swiftParcel.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder, validOrderBody } from '../fixtures/orders.js';

const paidOrder = { ...validOrderBody, paymentStatus: 'PAID' };

const SHIPPED_AT = new Date('2026-10-24T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function setup() {
  let now = SHIPPED_AT;
  const clock = () => now;
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(new SwiftParcelProvider({ random: createRandom(1), simulateLatency: false, now: clock }));
  providerRegistry.register(fake);
  const orderRepository = new InMemoryOrderRepository();
  const app = createApp({ providerRegistry, orderRepository, now: clock });
  return { app, fake, orderRepository, setNow: (date: Date) => (now = date) };
}

describe('GET /api/orders/:id/tracking', () => {
  it("shows the courier's current status, translated, without changing the order", async () => {
    const { app, setNow } = setup();
    const id = (await request(app).post('/api/orders').send(paidOrder).expect(201)).body.data.id;
    const shipped = (await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'swiftparcel', service: 'standard' }).expect(200)).body.data;
    setNow(new Date(SHIPPED_AT.getTime() + 7 * HOUR));

    const res = await request(app).get(`/api/orders/${id}/tracking`).expect(200);

    expect(res.body.data).toEqual({
      providerId: 'swiftparcel',
      providerName: 'SwiftParcel',
      trackingNumber: shipped.trackingNumber,
      externalStatus: 'in_transit',
      status: 'IN_TRANSIT',
      updatedAt: new Date(SHIPPED_AT.getTime() + 6 * HOUR).toISOString(),
      checkedAt: new Date(SHIPPED_AT.getTime() + 7 * HOUR).toISOString(),
    });
    // Shown, not applied: the order is still SHIPPED and the history didn't grow.
    expect((await request(app).get(`/api/orders/${id}`)).body.data.status).toBe('SHIPPED');
    expect((await request(app).get(`/api/orders/${id}/events`)).body.data).toHaveLength(3);
  });

  it('answers 409 NOT_SHIPPED for an order no courier has yet', async () => {
    const { app } = setup();
    const id = (await request(app).post('/api/orders').send(paidOrder).expect(201)).body.data.id;

    const res = await request(app).get(`/api/orders/${id}/tracking`).expect(409);
    expect(res.body.error).toMatchObject({ code: 'NOT_SHIPPED', message: 'Order ORD-1001 has not been handed to a courier yet' });
  });

  it('answers 409 DEMO_SHIPMENT for generated demo tracking numbers, without asking the courier', async () => {
    const { app, orderRepository } = setup();
    const { orderNumber: _n, ...demo } = buildOrder({
      id: 'demo-1',
      status: 'IN_TRANSIT',
      courierProvider: 'swiftparcel',
      trackingNumber: 'DEMO-SP-123456',
    });
    await orderRepository.create(demo);

    const res = await request(app).get('/api/orders/demo-1/tracking').expect(409);
    expect(res.body.error.code).toBe('DEMO_SHIPMENT');
  });

  it('passes on a courier that has no record of the shipment (e.g. after a restart) as 422', async () => {
    const { app, orderRepository } = setup();
    const { orderNumber: _n, ...forgotten } = buildOrder({ id: 'old-1', status: 'SHIPPED', courierProvider: 'fake', trackingNumber: 'FAKE-9999' });
    await orderRepository.create(forgotten);

    const res = await request(app).get('/api/orders/old-1/tracking').expect(422);
    expect(res.body.error).toMatchObject({
      code: 'PROVIDER_REJECTED',
      details: [{ providerId: 'fake', code: 'SHIPMENT_NOT_FOUND', message: 'Fake Courier has no such shipment' }],
    });
  });

  it('answers 502 when the courier is temporarily unavailable, and changes nothing', async () => {
    const { app, fake, orderRepository } = setup();
    fake.statusReport = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'try later' };
    const { orderNumber: _n, ...order } = buildOrder({ id: 'busy-1', status: 'SHIPPED', courierProvider: 'fake', trackingNumber: 'FAKE-0001' });
    await orderRepository.create(order);

    const res = await request(app).get('/api/orders/busy-1/tracking').expect(502);
    expect(res.body.error.message).toBe('Fake Courier is temporarily unavailable. Nothing was changed; try again later.');
  });

  it('returns 404 for an unknown order', async () => {
    const { app } = setup();
    await request(app).get('/api/orders/missing/tracking').expect(404);
  });
});
