import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '../../src/db/pool.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import type { OrderRepository } from '../../src/repositories/orderRepository.js';
import { OrderService } from '../../src/services/orderService.js';
import { ShipmentService } from '../../src/services/shipmentService.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { createPostgresStorage } from '../../src/storage.js';
import { buildSimulatedWebhook } from '../../src/webhooks/simulator.js';
import { createPostgresApp, paidOrderBody } from './support/app.js';
import { createTestPool, resetDatabase } from './support/db.js';

// Two "server processes": two apps, each with its own connection pool, on the same database. Nothing in
// memory is shared between them, so only the database can stop them from both doing the same work.
const SECRET = 'concurrency-secret-'.padEnd(64, 'c');
const poolA = createTestPool();
const poolB = createTestPool();
afterAll(async () => {
  await poolA.end();
  await poolB.end();
});
beforeEach(() => resetDatabase(poolA));

function instances() {
  const a = createPostgresApp(poolA, { webhookSecrets: { fake: SECRET } });
  const b = createPostgresApp(poolB, { webhookSecrets: { fake: SECRET } });
  return { a, b, courierCalls: () => a.fake.calls.length + b.fake.calls.length };
}

async function createOrder(app: Parameters<typeof request>[0], body: object = paidOrderBody): Promise<string> {
  return (await request(app).post('/api/orders').send(body).expect(201)).body.data.id;
}

async function eventTypes(pool: Pool, orderId: string): Promise<string[]> {
  const { rows } = await pool.query<{ type: string }>('SELECT type FROM order_events WHERE order_id = $1 ORDER BY created_at, seq', [orderId]);
  return rows.map((row) => row.type);
}

// Holds every caller's first read until `parties` callers have read: both requests then decide on the same old
// state, which is exactly the race. Only the database's conditional UPDATE can stop the second one now.
function withReadBarrier(repository: OrderRepository, barrier: { arrive: () => Promise<void> }): OrderRepository {
  return {
    create: (order) => repository.create(order),
    findAll: (filter) => repository.findAll(filter),
    findByTrackingNumber: (trackingNumber) => repository.findByTrackingNumber(trackingNumber),
    findShippingStartedBefore: (before) => repository.findShippingStartedBefore(before),
    update: (id, expected, changes) => repository.update(id, expected, changes),
    findById: async (id) => {
      const order = await repository.findById(id);
      await barrier.arrive();
      return order;
    },
  };
}

function readBarrier(parties: number) {
  let arrived = 0;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return {
    arrive: () => {
      arrived += 1;
      if (arrived >= parties) open();
      return opened;
    },
  };
}

// One OrderService per pool (= per instance), both reading through the same barrier.
function racingServices() {
  const barrier = readBarrier(2);
  return [poolA, poolB].map((pool) => {
    const storage = createPostgresStorage(pool);
    return new OrderService(withReadBarrier(storage.orderRepository, barrier), storage.orderEventRepository, undefined, storage.runInTransaction);
  });
}

describe('two app instances on one database', () => {
  it('lets only one of two changes win even when both read the order before either writes', async () => {
    const { a } = instances();
    const id = await createOrder(a.app);
    const [first, second] = racingServices();

    const results = await Promise.allSettled([
      first!.changeStatus(id, 'PROCESSING', { source: 'api', message: 'Packed' }),
      second!.changeStatus(id, 'CANCELLED', { source: 'api', message: 'Cancelled' }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await eventTypes(poolA, id)).toEqual(['ORDER_CREATED', 'STATUS_CHANGED']);
  });

  it('lets only one instance take the shipping lock even when both read the order first (order being prepared)', async () => {
    const { a } = instances();
    const id = await createOrder(a.app);
    await poolA.query("UPDATE orders SET status = 'PROCESSING' WHERE id = $1", [id]); // being prepared: the status won't change
    const fakes = [new FakeProvider(), new FakeProvider()];
    const shipments = racingServices().map((orders, i) => {
      const registry = new ProviderRegistry();
      registry.register(fakes[i]!);
      return new ShipmentService(orders, registry);
    });

    const results = await Promise.allSettled(shipments.map((service) => service.ship(id, { providerId: 'fake', service: 'standard' })));

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'SHIPMENT_IN_PROGRESS' } });
    expect(fakes[0]!.calls.length + fakes[1]!.calls.length).toBe(1);
  });

  it('lets exactly one of 20 simultaneous conflicting status changes win, with one event', async () => {
    const { a } = instances();
    const id = await createOrder(a.app);
    const services = [poolA, poolB].map((pool) => {
      const storage = createPostgresStorage(pool);
      return new OrderService(storage.orderRepository, storage.orderEventRepository, undefined, storage.runInTransaction);
    });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        services[i % 2]!.changeStatus(id, i % 2 === 0 ? 'PROCESSING' : 'CANCELLED', { source: 'api', message: `request ${i}` }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'INVALID_STATUS_TRANSITION', httpStatus: 409 });
    }
    expect(await eventTypes(poolA, id)).toEqual(['ORDER_CREATED', 'STATUS_CHANGED']);
  });

  it('calls the courier once when both instances ship the same order at the same moment', async () => {
    const { a, b, courierCalls } = instances();
    const id = await createOrder(a.app);
    const ship = { providerId: 'fake', service: 'standard' };

    const results = await Promise.all([request(a.app).post(`/api/orders/${id}/ship`).send(ship), request(b.app).post(`/api/orders/${id}/ship`).send(ship)]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409)?.body.error.code).toBe('SHIPMENT_IN_PROGRESS');
    expect(courierCalls()).toBe(1);
  });

  it('refuses the second instance while the first one is still waiting for the courier', async () => {
    const { a, b, courierCalls } = instances();
    const id = await createOrder(a.app);
    let release!: () => void;
    a.fake.gate = new Promise((resolve) => (release = resolve));

    const first = request(a.app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).then((res) => res);
    await vi.waitFor(() => expect(a.fake.calls).toHaveLength(1));
    const second = await request(b.app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' });
    release();

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SHIPMENT_IN_PROGRESS');
    expect((await first).status).toBe(200);
    expect(courierCalls()).toBe(1);
  });

  it('records a payment once when both instances mark the order paid', async () => {
    const { a, b } = instances();
    const id = await createOrder(a.app, { ...paidOrderBody, paymentStatus: 'UNPAID' });

    const results = await Promise.all([request(a.app).post(`/api/orders/${id}/mark-paid`), request(b.app).post(`/api/orders/${id}/mark-paid`)]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect((await eventTypes(poolA, id)).filter((type) => type === 'PAYMENT_RECORDED')).toHaveLength(1);
  });

  it('applies a webhook delivered to both instances once', async () => {
    const { a, b } = instances();
    const id = await createOrder(a.app);
    await request(a.app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(200);
    const webhook = buildSimulatedWebhook({ spec: a.fake.webhook, secret: SECRET, trackingNumber: 'FAKE-0001', externalStatus: 'in_transit' });
    const send = (app: typeof a.app) => request(app).post('/api/webhooks/fake').set(webhook.headers).send(webhook.rawBody.toString());

    const results = await Promise.all([send(a.app), send(b.app)]);

    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(results.map((res) => res.body.data.status).sort()).toEqual(['accepted', 'duplicate']);
    expect(await eventTypes(poolA, id)).toEqual(['ORDER_CREATED', 'STATUS_CHANGED', 'SHIPMENT_CREATED', 'STATUS_CHANGED']);
  });

  it('creates one order for one Idempotency-Key sent to both instances, and replays it after a "restart"', async () => {
    const { a, b } = instances();
    const send = (app: typeof a.app) => request(app).post('/api/orders').set('Idempotency-Key', 'order-form-1').send(paidOrderBody);

    const results = await Promise.all([send(a.app), send(b.app)]);

    expect(results.map((res) => res.status)).toEqual([201, 201]);
    expect(results[0]!.body.data.id).toBe(results[1]!.body.data.id);
    expect(results.filter((res) => res.headers['idempotent-replayed'] === 'true')).toHaveLength(1);
    const { rows } = await poolA.query<{ count: string }>('SELECT count(*) FROM orders');
    expect(rows[0]!.count).toBe('1');

    // A new instance with a fresh pool still knows the key: it lives in the database, not in a process.
    const fresh = createTestPool(1);
    try {
      const replay = await request(createPostgresApp(fresh).app).post('/api/orders').set('Idempotency-Key', 'order-form-1').send(paidOrderBody).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.data.id).toBe(results[0]!.body.data.id);
    } finally {
      await fresh.end();
    }
  });
});
