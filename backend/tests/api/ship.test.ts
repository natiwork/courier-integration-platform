import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createRandom } from '../../src/lib/random.js';
import { NordCargoProvider } from '../../src/providers/nordCargo.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { SwiftParcelProvider } from '../../src/providers/swiftParcel.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder, validOrderBody } from '../fixtures/orders.js';
import { scriptedRandom } from '../fixtures/shipments.js';

// Ships to Germany unless a test says otherwise: both mock couriers deliver there.
const berlinOrder = {
  ...validOrderBody,
  deliveryAddress: 'Torstraße 12',
  destinationCity: 'Berlin',
  postalCode: '10115',
  destinationCountry: 'DE',
  paymentStatus: 'PAID', // only paid orders ship
};

function setup() {
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  providerRegistry.register(new SwiftParcelProvider({ random: createRandom(1), simulateLatency: false }));
  // NordCargo is always available here (the roll is above its 20% failure rate).
  providerRegistry.register(new NordCargoProvider({ random: () => 0.9, simulateLatency: false }));
  const orderRepository = new InMemoryOrderRepository();
  const app = createApp({ providerRegistry, orderRepository });

  async function createOrder(body: object = berlinOrder): Promise<string> {
    const res = await request(app).post('/api/orders').send(body).expect(201);
    return res.body.data.id;
  }
  const ship = (id: string, body: object) => request(app).post(`/api/orders/${id}/ship`).send(body);
  const get = async (id: string) => (await request(app).get(`/api/orders/${id}`).expect(200)).body.data;
  const history = async (id: string) => (await request(app).get(`/api/orders/${id}/events`).expect(200)).body.data;

  return { app, fake, orderRepository, createOrder, ship, get, history };
}

describe('POST /api/orders/:id/ship', () => {
  let t: ReturnType<typeof setup>;

  beforeEach(() => {
    t = setup();
  });

  it('ships through the courier: SHIPPED, tracking number, provider id, and both steps recorded', async () => {
    const id = await t.createOrder();

    const res = await t.ship(id, { providerId: 'swiftparcel', service: 'express' }).expect(200);

    expect(res.body.data).toMatchObject({
      id,
      status: 'SHIPPED',
      courierProvider: 'swiftparcel',
      trackingNumber: expect.stringMatching(/^SP\d{10}$/),
    });
    expect(await t.get(id)).toEqual(res.body.data);
    const history = await t.history(id);
    expect(history.map((e: { type: string; toStatus: string }) => [e.type, e.toStatus])).toEqual([
      ['ORDER_CREATED', 'PENDING'],
      ['STATUS_CHANGED', 'PROCESSING'],
      ['SHIPMENT_CREATED', 'SHIPPED'],
    ]);
    expect(history[1]).toMatchObject({ source: 'api', providerId: 'swiftparcel', message: 'Shipping requested with SwiftParcel (Express)' });
    expect(history[2]).toMatchObject({ source: 'provider', providerId: 'swiftparcel', code: null });
  });

  it('passes the order data to the courier', async () => {
    const id = await t.createOrder();
    await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(200);

    expect(t.fake.calls).toEqual([
      {
        orderId: id,
        orderNumber: 'ORD-1001',
        recipientName: 'Ada Lovelace',
        address: { street: 'Torstraße 12', city: 'Berlin', postalCode: '10115', country: 'DE' },
        parcelWeightKg: 2.4,
        service: 'standard',
      },
    ]);
  });

  it('refuses to ship an already shipped order with 409 ALREADY_SHIPPED and never calls the courier again', async () => {
    const id = await t.createOrder();
    await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(200);

    const res = await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(409);

    expect(res.body.error).toMatchObject({ code: 'ALREADY_SHIPPED', message: 'Order ORD-1001 was already shipped (tracking number FAKE-0001)' });
    expect(t.fake.calls).toHaveLength(1);
  });

  it('refuses a status that cannot move to PROCESSING with 409 INVALID_STATUS_TRANSITION', async () => {
    const { orderNumber: _n, ...cancelled } = buildOrder({ id: 'cancelled-1', status: 'CANCELLED' });
    await t.orderRepository.create(cancelled);

    const res = await t.ship('cancelled-1', { providerId: 'fake', service: 'standard' }).expect(409);

    expect(res.body.error).toMatchObject({ code: 'INVALID_STATUS_TRANSITION', details: [{ from: 'CANCELLED', to: 'PROCESSING' }] });
    expect(t.fake.calls).toHaveLength(0);
  });

  it('returns 404 for an unknown order', async () => {
    const res = await t.ship('missing', { providerId: 'fake', service: 'standard' }).expect(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it.each([
    [{ providerId: 'parcelpigeon', service: 'standard' }, 'providerId', 'Unknown courier provider'],
    [{ providerId: 'nordcargo', service: 'express' }, 'service', 'NordCargo has no "express" service. Choose one of: standard, economy'],
    [{ service: 'standard' }, 'providerId', 'Courier is required'],
    [{ providerId: 'fake', service: 'standard', status: 'DELIVERED' }, '', 'Unrecognized key: "status"'],
  ])('rejects %o with 400 on %s', async (body, path, message) => {
    const id = await t.createOrder();
    const res = await t.ship(id, body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ path, message });
    expect((await t.get(id)).status).toBe('PENDING');
  });

  it.each([
    ['too heavy', { ...berlinOrder, parcelWeightKg: 30.5 }, 'WEIGHT_LIMIT_EXCEEDED', "NordCargo can't take this order: NordCargo accepts parcels up to 30 kg"],
    ['outside its countries', { ...berlinOrder, destinationCountry: 'IT' }, 'UNSUPPORTED_DESTINATION', "NordCargo can't take this order: NordCargo does not deliver to IT"],
  ])('checks the courier limits first (%s): 422, courier never called, order unchanged', async (_case, body, code, message) => {
    const nord = new NordCargoProvider({ random: () => 0.9, simulateLatency: false });
    const spy = vi.spyOn(nord, 'createShipment');
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(nord);
    const app = createApp({ providerRegistry });
    const created = await request(app).post('/api/orders').send(body).expect(201);

    const res = await request(app).post(`/api/orders/${created.body.data.id}/ship`).send({ providerId: 'nordcargo', service: 'standard' }).expect(422);

    expect(res.body.error).toMatchObject({ code: 'COURIER_CANNOT_TAKE_ORDER', message, details: [{ providerId: 'nordcargo', code }] });
    expect(spy).not.toHaveBeenCalled();
    const after = await request(app).get(`/api/orders/${created.body.data.id}`).expect(200);
    expect(after.body.data.status).toBe('PENDING');
    const events = await request(app).get(`/api/orders/${created.body.data.id}/events`).expect(200);
    expect(events.body.data).toHaveLength(1);
  });

  it('turns a courier rejection into 422 PROVIDER_REJECTED, a FAILED order and an event with the courier code', async () => {
    // A real mock: NordCargo needs a house number in the street address.
    const id = await t.createOrder({ ...berlinOrder, deliveryAddress: 'Torstraße' });

    const res = await t.ship(id, { providerId: 'nordcargo', service: 'standard' }).expect(422);

    expect(res.body.error).toMatchObject({
      code: 'PROVIDER_REJECTED',
      message: 'NordCargo rejected the request: NordCargo requires a house number in the street address',
      details: [{ providerId: 'nordcargo', code: 'INVALID_ADDRESS', message: 'NordCargo requires a house number in the street address' }],
    });
    expect(await t.get(id)).toMatchObject({ status: 'FAILED', trackingNumber: null, courierProvider: null });
    expect((await t.history(id)).at(-1)).toMatchObject({
      type: 'SHIPMENT_REJECTED',
      fromStatus: 'PROCESSING',
      toStatus: 'FAILED',
      source: 'provider',
      providerId: 'nordcargo',
      code: 'INVALID_ADDRESS',
      message: 'NordCargo rejected the shipment: NordCargo requires a house number in the street address',
    });
  });

  it('turns a temporary courier failure into 502 PROVIDER_UNAVAILABLE, a FAILED order and an event', async () => {
    const providerRegistry = new ProviderRegistry();
    // Not slow, a delay, then the availability roll: 0.1 is below NordCargo's 20% failure rate.
    providerRegistry.register(new NordCargoProvider({ random: scriptedRandom(0.9, 0.5, 0.1), simulateLatency: false }));
    const app = createApp({ providerRegistry });
    const id = (await request(app).post('/api/orders').send(berlinOrder).expect(201)).body.data.id;

    const res = await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'nordcargo', service: 'standard' }).expect(502);

    expect(res.body.error).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'NordCargo is temporarily unavailable. Tried 3 times. The order was marked as failed; you can try again.',
      details: [{ providerId: 'nordcargo', code: 'PROVIDER_UNAVAILABLE' }],
    });
    const events = (await request(app).get(`/api/orders/${id}/events`).expect(200)).body.data;
    expect(events.at(-1)).toMatchObject({ type: 'PROVIDER_UNAVAILABLE', toStatus: 'FAILED', code: 'PROVIDER_UNAVAILABLE' });
  });

  it('treats a courier that throws as unavailable, so the order never gets stuck in PROCESSING', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    t.fake.next = () => {
      throw new Error('socket hang up');
    };
    const id = await t.createOrder();

    const res = await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(502);

    expect(res.body.error.details).toEqual([{ providerId: 'fake', code: 'PROVIDER_ERROR', message: 'The courier returned an unexpected error' }]);
    expect((await t.get(id)).status).toBe('FAILED');
  });

  it('lets a failed shipment be tried again, with the whole story in the history', async () => {
    t.fake.next = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'try later' };
    const id = await t.createOrder();
    await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(502);

    t.fake.next = { kind: 'success', value: { trackingNumber: 'FAKE-0002', status: 'SHIPPED', externalStatus: 'accepted' } };
    const res = await t.ship(id, { providerId: 'fake', service: 'standard' }).expect(200);

    expect(res.body.data).toMatchObject({ status: 'SHIPPED', trackingNumber: 'FAKE-0002' });
    expect((await t.history(id)).map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'PENDING',
      'PROCESSING',
      'FAILED',
      'PROCESSING',
      'SHIPPED',
    ]);
  });

  it('refuses a second ship request while the first is still waiting for the courier (409 SHIPMENT_IN_PROGRESS)', async () => {
    let release!: () => void;
    t.fake.gate = new Promise((resolve) => (release = resolve));
    const id = await t.createOrder();

    const first = t.ship(id, { providerId: 'fake', service: 'standard' }).then((res) => res);
    // Wait until the first request is really inside the courier call.
    await vi.waitFor(() => expect(t.fake.calls).toHaveLength(1));
    const second = await t.ship(id, { providerId: 'fake', service: 'standard' });
    release();

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SHIPMENT_IN_PROGRESS');
    expect((await first).status).toBe(200);
    expect(t.fake.calls).toHaveLength(1);
  });

  it('refuses two requests sent in the same tick: only one reaches the courier', async () => {
    const id = await t.createOrder();
    const results = await Promise.all([
      t.ship(id, { providerId: 'fake', service: 'standard' }),
      t.ship(id, { providerId: 'fake', service: 'standard' }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(t.fake.calls).toHaveLength(1);
  });
});
