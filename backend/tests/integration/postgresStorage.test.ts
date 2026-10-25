import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PAYMENT_STATUSES } from '../../src/domain/order.js';
import { ORDER_EVENT_TYPES } from '../../src/domain/orderEvent.js';
import { ORDER_STATUSES } from '../../src/domain/orderStatus.js';
import { createPool } from '../../src/db/pool.js';
import type { OrderEvent } from '../../src/domain/orderEvent.js';
import { createPostgresStorage } from '../../src/storage.js';
import { buildOrder } from '../fixtures/orders.js';
import { createPostgresApp, paidOrderBody } from './support/app.js';
import { createTestPool, resetDatabase } from './support/db.js';

const pool = createTestPool();
afterAll(() => pool.end());
beforeEach(() => resetDatabase(pool));

async function checkValues(table: string, constraint: string): Promise<string[]> {
  const { rows } = await pool.query<{ def: string }>(
    'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2',
    [table, constraint],
  );
  return [...rows[0]!.def.matchAll(/'([^']+)'::text/g)].map((match) => match[1]!).sort();
}

describe('PostgreSQL schema', () => {
  // The allowed values live twice: as TypeScript constants and as CHECK constraints. This keeps them equal.
  it.each([
    ['orders', 'orders_status_check', ORDER_STATUSES],
    ['orders', 'orders_payment_status_check', PAYMENT_STATUSES],
    ['order_events', 'order_events_type_check', ORDER_EVENT_TYPES],
    ['order_events', 'order_events_from_status_check', ORDER_STATUSES],
    ['order_events', 'order_events_to_status_check', ORDER_STATUSES],
    ['order_events', 'order_events_source_check', ['api', 'provider', 'webhook', 'system']],
  ])('%s.%s allows exactly the values the code uses', async (table, constraint, values) => {
    expect(await checkValues(table, constraint)).toEqual([...values].sort());
  });

  it('rejects a status the code doesn\'t know', async () => {
    const { orderNumber: _n, ...order } = buildOrder({ id: randomUUID() });
    const storage = createPostgresStorage(pool);
    await expect(storage.orderRepository.create({ ...order, status: 'LOST' as never })).rejects.toThrow(/orders_status_check/);
  });
});

describe('PostgreSQL storage', () => {
  it('runs the whole API flow on the database: create, history, ship', async () => {
    const { app } = createPostgresApp(pool);

    const created = await request(app).post('/api/orders').send(paidOrderBody).expect(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ orderNumber: 'ORD-1001', totalCents: 2500, shippingStartedAt: null });

    const shipped = await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(200);
    expect(shipped.body.data).toMatchObject({ status: 'SHIPPED', trackingNumber: 'FAKE-0001', shippingStartedAt: null });

    const history = await request(app).get(`/api/orders/${id}/events`).expect(200);
    expect(history.body.data.map((event: OrderEvent) => event.type)).toEqual(['ORDER_CREATED', 'STATUS_CHANGED', 'SHIPMENT_CREATED']);
    await request(app).get('/api/orders/not-a-uuid').expect(404);
  });

  it('rolls back the order change when its event can\'t be written', async () => {
    const storage = createPostgresStorage(pool);
    const { orderNumber: _n, ...order } = buildOrder({ id: randomUUID(), status: 'PENDING' });
    await storage.orderRepository.create(order);

    const attempt = storage.runInTransaction!(async ({ orders, events }) => {
      await orders.update(order.id, { status: 'PENDING' }, { status: 'PROCESSING', updatedAt: '2026-05-01T00:00:00.000Z' });
      // Violates the CHECK on the event type: the INSERT fails after the UPDATE already ran.
      await events.append({
        id: randomUUID(),
        orderId: order.id,
        type: 'NOT_A_TYPE' as never,
        fromStatus: 'PENDING',
        toStatus: 'PROCESSING',
        source: 'api',
        message: 'never stored',
        providerId: null,
        code: null,
        attempts: null,
        createdAt: '2026-05-01T00:00:00.000Z',
      });
    });

    await expect(attempt).rejects.toThrow(/order_events_type_check/);
    expect((await storage.orderRepository.findById(order.id))?.status).toBe('PENDING');
    expect(await storage.orderEventRepository.findByOrderId(order.id)).toEqual([]);
  });

  it('answers 409 DUPLICATE_RECORD when a tracking number is already used by another order', async () => {
    const storage = createPostgresStorage(pool);
    const { orderNumber: _a, ...first } = buildOrder({ id: randomUUID(), trackingNumber: 'SP0000000001' });
    const { orderNumber: _b, ...second } = buildOrder({ id: randomUUID() });
    await storage.orderRepository.create(first);
    await storage.orderRepository.create(second);

    await expect(
      storage.orderRepository.update(second.id, {}, { trackingNumber: 'SP0000000001', updatedAt: '2026-05-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RECORD', httpStatus: 409 });
  });

  it('answers 503 DATABASE_UNAVAILABLE when the database can\'t be reached', async () => {
    // Port 1 on localhost: nothing listens there, the connection is refused at once.
    const unreachable = createPool('postgres://nobody:nothing@127.0.0.1:1/none');
    const { app } = createPostgresApp(unreachable);
    try {
      const list = await request(app).get('/api/orders').expect(503);
      expect(list.body.error).toMatchObject({ code: 'DATABASE_UNAVAILABLE', message: 'The database is not available right now. Try again in a moment.' });
      const create = await request(app).post('/api/orders').send(paidOrderBody).expect(503);
      expect(create.body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(JSON.stringify(create.body)).not.toMatch(/nothing|ECONNREFUSED|127\.0\.0\.1/);
    } finally {
      await unreachable.end();
    }
  });
});
