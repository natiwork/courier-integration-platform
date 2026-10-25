import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Order } from '../../src/domain/order.js';
import type { CreatedShipment, ProviderResult } from '../../src/providers/courierProvider.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import type { NewOrder } from '../../src/repositories/orderRepository.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { validOrderBody } from '../fixtures/orders.js';

const paidOrder = { ...validOrderBody, paymentStatus: 'PAID' };
const ship = { providerId: 'fake', service: 'standard' };
const unavailable: ProviderResult<CreatedShipment> = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'Try later' };

function setup(options: { now?: () => Date; orderRepository?: InMemoryOrderRepository } = {}) {
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  const app = createApp({ providerRegistry, retryPolicy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 }, ...options });
  const countOrders = async () => (await request(app).get('/api/orders')).body.data.length;
  return { app, fake, countOrders };
}

describe('Idempotency-Key on POST /api/orders', () => {
  it('the same key and body twice: ONE order, and the second answer is the first one replayed', async () => {
    const { app, countOrders } = setup();

    const first = await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);

    expect(second.body).toEqual(first.body);
    expect(second.headers.location).toBe(first.headers.location);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(await countOrders()).toBe(1);
  });

  it('treats the same body with its keys in another order as the same request', async () => {
    const { app, countOrders } = setup();
    const reordered = Object.fromEntries(Object.entries(validOrderBody).reverse());

    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);
    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(reordered).expect(201);

    expect(await countOrders()).toBe(1);
  });

  it('the same key with a different body: 422 IDEMPOTENCY_KEY_REUSED, and nothing is created', async () => {
    const { app, countOrders } = setup();
    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-1')
      .send({ ...validOrderBody, customerName: 'Someone Else' })
      .expect(422);

    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await countOrders()).toBe(1);
  });

  it('concurrent requests with one key create ONE order and both get the same answer', async () => {
    const { app, countOrders } = setup();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody)),
    );

    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((res) => res.body.data.id)).size).toBe(1);
    expect(await countOrders()).toBe(1);
  });

  it('without a key it works as before: two requests, two orders', async () => {
    const { app, countOrders } = setup();
    await request(app).post('/api/orders').send(validOrderBody).expect(201);
    await request(app).post('/api/orders').send(validOrderBody).expect(201);
    expect(await countOrders()).toBe(2);
  });

  it('replays a validation error too, exactly', async () => {
    const { app } = setup();
    const first = await request(app).post('/api/orders').set('Idempotency-Key', 'bad-1').send({ customerName: '' }).expect(400);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', 'bad-1').send({ customerName: '' }).expect(400);
    expect(second.body).toEqual(first.body);
  });

  it('rejects a malformed key with 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const { app, countOrders } = setup();
    for (const key of ['has space', 'x'.repeat(256)]) {
      const res = await request(app).post('/api/orders').set('Idempotency-Key', key).send(validOrderBody).expect(400);
      expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    }
    expect(await countOrders()).toBe(0);
  });

  it('forgets keys after 24 hours: the same key then creates a new order', async () => {
    let now = new Date('2026-10-24T09:00:00.000Z');
    const { app, countOrders } = setup({ now: () => now });
    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);

    now = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1);
    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);
    expect(await countOrders()).toBe(1);

    now = new Date(now.getTime() + 1);
    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);
    expect(await countOrders()).toBe(2);
  });

  it('does not store an unexpected 500, so the retry with the same key really runs again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Storage that fails once, like a database blip.
    class FlakyRepository extends InMemoryOrderRepository {
      failNext = true;
      override async create(order: NewOrder): Promise<Order> {
        if (this.failNext) {
          this.failNext = false;
          throw new Error('connection reset');
        }
        return super.create(order);
      }
    }
    const { app, countOrders } = setup({ orderRepository: new FlakyRepository() });

    await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(500);
    const retry = await request(app).post('/api/orders').set('Idempotency-Key', 'key-1').send(validOrderBody).expect(201);

    expect(retry.headers['idempotent-replayed']).toBeUndefined();
    expect(await countOrders()).toBe(1);
  });
});

describe('Idempotency-Key on POST /api/orders/:id/ship', () => {
  async function paid(app: ReturnType<typeof setup>['app']) {
    return (await request(app).post('/api/orders').send(paidOrder).expect(201)).body.data.id as string;
  }

  it('a retried ship request with the same key calls the courier once and gets the same 200', async () => {
    const { app, fake } = setup();
    const id = await paid(app);

    const first = await request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(200);
    const second = await request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(200);

    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(fake.calls).toHaveLength(1);
    // Without the key the domain guard is the second line of defence.
    expect((await request(app).post(`/api/orders/${id}/ship`).send(ship).expect(409)).body.error.code).toBe('ALREADY_SHIPPED');
  });

  it('a request that arrives while the first waits for the courier waits too, instead of 409', async () => {
    const { app, fake } = setup();
    let release!: () => void;
    fake.gate = new Promise((resolve) => (release = resolve));
    const id = await paid(app);

    const first = request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).then((res) => res);
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    const second = request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).then((res) => res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();

    const [a, b] = await Promise.all([first, second]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toEqual(a.body);
    expect(fake.calls).toHaveLength(1);
  });

  it('replays a courier failure for the same key; a new key (a new user action) ships again', async () => {
    const { app, fake } = setup();
    fake.next = unavailable;
    const id = await paid(app);

    await request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(502);
    await request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(502);
    expect(fake.calls).toHaveLength(3); // the 3 attempts of the first request only

    fake.next = { kind: 'success', value: { trackingNumber: 'FAKE-9', status: 'SHIPPED', externalStatus: 'accepted' } };
    await request(app).post(`/api/orders/${id}/ship`).set('Idempotency-Key', 'ship-2').send(ship).expect(200);
    expect(fake.calls).toHaveLength(4);
  });

  it('refuses a key that was used to ship another order', async () => {
    const { app } = setup();
    const first = await paid(app);
    const second = await paid(app);
    await request(app).post(`/api/orders/${first}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(200);

    const res = await request(app).post(`/api/orders/${second}/ship`).set('Idempotency-Key', 'ship-1').send(ship).expect(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
