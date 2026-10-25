import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder, validOrderBody } from '../fixtures/orders.js';

const ship = { providerId: 'fake', service: 'standard' };

function setup() {
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  const orderRepository = new InMemoryOrderRepository();
  let tick = Date.parse('2026-10-24T09:00:00.000Z');
  const app = createApp({ providerRegistry, orderRepository, now: () => new Date((tick += 60_000)) });
  return { app, fake, orderRepository };
}

describe('paying before shipping', () => {
  it.each(['UNPAID', 'REFUNDED'] as const)('refuses to ship a %s order with 409 ORDER_NOT_PAID and never calls the courier', async (paymentStatus) => {
    const { app, fake, orderRepository } = setup();
    const { orderNumber: _n, ...order } = buildOrder({ id: 'o-1', paymentStatus });
    await orderRepository.create(order);

    const res = await request(app).post('/api/orders/o-1/ship').send(ship).expect(409);

    expect(res.body.error).toMatchObject({
      code: 'ORDER_NOT_PAID',
      message: `Order ORD-1001 is ${paymentStatus.toLowerCase()}: only paid orders can be shipped`,
      details: [{ paymentStatus }],
    });
    expect(fake.calls).toHaveLength(0);
    expect((await request(app).get('/api/orders/o-1')).body.data.status).toBe('PENDING');
  });

  it('records a payment: PAID, a PAYMENT_RECORDED event that keeps the status, and the order can ship', async () => {
    const { app } = setup();
    const created = (await request(app).post('/api/orders').send(validOrderBody).expect(201)).body.data;
    expect(created.paymentStatus).toBe('UNPAID');

    const paid = await request(app).post(`/api/orders/${created.id}/mark-paid`).expect(200);

    expect(paid.body.data).toMatchObject({ paymentStatus: 'PAID', status: 'PENDING' });
    expect(paid.body.data.updatedAt).not.toBe(created.updatedAt);
    const history = (await request(app).get(`/api/orders/${created.id}/events`)).body.data;
    expect(history.at(-1)).toMatchObject({ type: 'PAYMENT_RECORDED', fromStatus: 'PENDING', toStatus: 'PENDING', source: 'api', message: 'Payment recorded' });
    await request(app).post(`/api/orders/${created.id}/ship`).send(ship).expect(200);
  });

  it('refuses to record a payment twice (409 PAYMENT_ALREADY_RECORDED) or for a refunded order', async () => {
    const { app, orderRepository } = setup();
    const { orderNumber: _a, ...refunded } = buildOrder({ id: 'r-1', paymentStatus: 'REFUNDED' });
    await orderRepository.create(refunded);
    const created = (await request(app).post('/api/orders').send(validOrderBody).expect(201)).body.data;
    await request(app).post(`/api/orders/${created.id}/mark-paid`).expect(200);

    const twice = await request(app).post(`/api/orders/${created.id}/mark-paid`).expect(409);
    expect(twice.body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    const res = await request(app).post('/api/orders/r-1/mark-paid').expect(409);
    expect(res.body.error).toMatchObject({ code: 'PAYMENT_ALREADY_RECORDED', message: 'Order ORD-1001 is already refunded' });
  });

  it('refuses to record a payment for a cancelled order (409 ORDER_CANCELLED) and 404s an unknown one', async () => {
    const { app, orderRepository } = setup();
    const { orderNumber: _n, ...cancelled } = buildOrder({ id: 'c-1', status: 'CANCELLED', paymentStatus: 'UNPAID' });
    await orderRepository.create(cancelled);

    expect((await request(app).post('/api/orders/c-1/mark-paid').expect(409)).body.error.code).toBe('ORDER_CANCELLED');
    await request(app).post('/api/orders/missing/mark-paid').expect(404);
  });

  it('does not count a recorded payment as a status change on the Overview', async () => {
    const { app } = setup();
    const created = (await request(app).post('/api/orders').send(validOrderBody).expect(201)).body.data;
    await request(app).post(`/api/orders/${created.id}/mark-paid`).expect(200);

    const stats = (await request(app).get('/api/stats/overview')).body.data;
    expect(Object.values(stats.today.activity).every((count) => count === 0)).toBe(true);
  });
});
