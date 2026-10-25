import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Order } from '../../src/domain/order.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { buildOrder } from '../fixtures/orders.js';

const SECRETS = { swiftparcel: 'swift-secret-'.padEnd(64, 's'), nordcargo: 'nord-secret-'.padEnd(64, 'n') };

function setup(webhookSimulator = true) {
  const orderRepository = new InMemoryOrderRepository();
  const app = createApp({ orderRepository, webhookSecrets: SECRETS, webhookSimulator });
  const order = async (overrides: Partial<Order>) => {
    const { orderNumber: _n, ...stored } = buildOrder({ status: 'IN_TRANSIT', courierProvider: 'swiftparcel', trackingNumber: 'SP0000000001', ...overrides });
    return (await orderRepository.create(stored)).id;
  };
  return { app, order };
}

describe('webhook simulator (dev only)', () => {
  it("offers only the courier's statuses the state machine accepts from the current status", async () => {
    const { app, order } = setup();
    const swift = await order({});
    const nord = await order({ status: 'SHIPPED', courierProvider: 'nordcargo', trackingNumber: 'NC-0000000001' });

    expect((await request(app).get(`/api/dev/webhook-simulator/${swift}`).expect(200)).body.data).toEqual({
      orderId: swift,
      providerId: 'swiftparcel',
      providerName: 'SwiftParcel',
      trackingNumber: 'SP0000000001',
      demo: false,
      options: [
        { externalStatus: 'delivered', status: 'DELIVERED' },
        { externalStatus: 'delivery_failed', status: 'FAILED' },
        { externalStatus: 'lost', status: 'FAILED' },
      ],
    });
    const nordOptions = (await request(app).get(`/api/dev/webhook-simulator/${nord}`)).body.data.options;
    expect(nordOptions.map((o: { externalStatus: string }) => o.externalStatus)).toEqual(['NC20', 'NC30', 'NC50']);
  });

  it('sends a signed update through the real webhook handling: the order moves, as a webhook event', async () => {
    const { app, order } = setup();
    const id = await order({});

    const res = await request(app).post('/api/dev/webhook-simulator').send({ orderId: id, externalStatus: 'delivered' }).expect(200);

    expect(res.body.data.result).toMatchObject({ status: 'accepted' });
    expect(res.body.data.sent.headers['x-swiftparcel-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(res.body.data.sent.body).toMatchObject({ tracking_number: 'SP0000000001', status: 'delivered' });
    expect((await request(app).get(`/api/orders/${id}`)).body.data.status).toBe('DELIVERED');
    expect((await request(app).get(`/api/orders/${id}/events`)).body.data.at(-1)).toMatchObject({ source: 'webhook', toStatus: 'DELIVERED' });
  });

  it('marks demo shipments as such and may update them (they are our orders)', async () => {
    const { app, order } = setup();
    const id = await order({ trackingNumber: 'DEMO-SP-123456' });
    expect((await request(app).get(`/api/dev/webhook-simulator/${id}`)).body.data.demo).toBe(true);
    await request(app).post('/api/dev/webhook-simulator').send({ orderId: id, externalStatus: 'delivered' }).expect(200);
  });

  it('refuses a status that is not a valid next step (400) and an order that has not shipped (409)', async () => {
    const { app, order } = setup();
    const id = await order({});
    const pending = await order({ status: 'PENDING', courierProvider: null, trackingNumber: null });

    const res = await request(app).post('/api/dev/webhook-simulator').send({ orderId: id, externalStatus: 'in_transit' }).expect(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'externalStatus' });
    await request(app).get(`/api/dev/webhook-simulator/${pending}`).expect(409);
  });

  it('is announced in GET /api/meta/features, so the UI knows whether to offer it', async () => {
    expect((await request(setup(true).app).get('/api/meta/features').expect(200)).body).toEqual({ data: { webhookSimulator: true } });
    expect((await request(setup(false).app).get('/api/meta/features').expect(200)).body).toEqual({ data: { webhookSimulator: false } });
  });

  it('does not exist when turned off (production default)', async () => {
    const { app, order } = setup(false);
    const id = await order({});
    await request(app).get(`/api/dev/webhook-simulator/${id}`).expect(404);
    await request(app).post('/api/dev/webhook-simulator').send({ orderId: id, externalStatus: 'delivered' }).expect(404);
  });
});
