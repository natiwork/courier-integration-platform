import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { generateDemoEvents, generateDemoOrders } from '../../src/seed/demoOrders.js';
import { seedDemoDataIfEmpty } from '../../src/seed/seedDatabase.js';
import { OrderService } from '../../src/services/orderService.js';
import { RecoveryService } from '../../src/services/recoveryService.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { createPostgresStorage } from '../../src/storage.js';
import { createPostgresApp, paidOrderBody } from './support/app.js';
import { createTestPool, resetDatabase } from './support/db.js';

const pool = createTestPool();
afterAll(() => pool.end());
beforeEach(() => resetDatabase(pool));

const NOW = new Date('2026-10-25T12:00:00.000Z');

describe('seedDemoDataIfEmpty', () => {
  it('writes exactly the same orders and events as the in-memory seed', async () => {
    const result = await seedDemoDataIfEmpty(pool, NOW);

    const orders = generateDemoOrders(NOW);
    const events = generateDemoEvents(orders);
    expect(result).toEqual({ seeded: true, orders: orders.length, events: events.length });

    const memoryOrders = new InMemoryOrderRepository();
    for (const order of orders) await memoryOrders.create(order);
    const memoryEvents = new InMemoryOrderEventRepository();
    for (const event of events) await memoryEvents.append(event);
    const storage = createPostgresStorage(pool);
    expect(await storage.orderRepository.findAll()).toEqual(await memoryOrders.findAll());
    expect(await storage.orderEventRepository.findRecent()).toEqual(await memoryEvents.findRecent());
  });

  it('never writes into a database that already has orders, so a restart doesn\'t duplicate anything', async () => {
    const first = await seedDemoDataIfEmpty(pool, NOW);
    const second = await seedDemoDataIfEmpty(pool, NOW);

    expect(second).toEqual({ seeded: false, orders: 0, events: 0 });
    const { rows } = await pool.query<{ orders: string; events: string }>(
      'SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM order_events) AS events',
    );
    expect(rows[0]).toEqual({ orders: String(first.orders), events: String(first.events) });
  });

  it('seeds once when two processes start at the same time', async () => {
    const other = createTestPool(2);
    try {
      const results = await Promise.all([seedDemoDataIfEmpty(pool, NOW), seedDemoDataIfEmpty(other, NOW)]);
      expect(results.map((result) => result.seeded).sort()).toEqual([false, true]);
    } finally {
      await other.end();
    }
  });

  it('continues the order numbers after the demo orders', async () => {
    const { orders } = await seedDemoDataIfEmpty(pool, NOW);
    const { app } = createPostgresApp(pool);

    const created = await request(app).post('/api/orders').send(paidOrderBody).expect(201);

    expect(created.body.data.orderNumber).toBe(`ORD-${1001 + orders}`);
  });

  it('leaves demo orders being prepared untouched by the recovery job, and they can be shipped', async () => {
    await seedDemoDataIfEmpty(pool, NOW);
    const storage = createPostgresStorage(pool);
    const prepared = await storage.orderRepository.findAll({ status: 'PROCESSING' });
    expect(prepared.length).toBeGreaterThan(0);

    const orders = new OrderService(storage.orderRepository, storage.orderEventRepository, undefined, storage.runInTransaction);
    expect(await new RecoveryService(orders, new ProviderRegistry()).recoverInterruptedShipments()).toEqual([]);
    expect(await storage.orderRepository.findAll({ status: 'PROCESSING' })).toEqual(prepared);

    // The fake courier takes up to 20 kg; only paid orders ship.
    const shippable = prepared.find((order) => order.paymentStatus === 'PAID' && order.parcelWeightKg <= 20)!;
    const { app } = createPostgresApp(pool);
    const res = await request(app).post(`/api/orders/${shippable.id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'SHIPPED', shippingStartedAt: null });
  });
});
