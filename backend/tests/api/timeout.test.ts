import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { buildOrder, validOrderBody } from '../fixtures/orders.js';

// A courier that never answers, and a short real deadline so the test stays fast.
function setup() {
  const fake = new FakeProvider();
  fake.gate = new Promise(() => {});
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  const orderRepository = new InMemoryOrderRepository();
  const app = createApp({ providerRegistry, orderRepository, providerTimeoutMs: 50 });
  return { app, fake, orderRepository };
}

describe('courier timeouts', () => {
  it('turns a courier that never answers into 504 PROVIDER_TIMEOUT, a FAILED order and an event, and cancels the call', async () => {
    const { app, fake } = setup();
    const id = (await request(app).post('/api/orders').send({ ...validOrderBody, paymentStatus: 'PAID' }).expect(201)).body.data.id;

    const res = await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(504);

    expect(res.body.error).toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      message: 'Fake Courier did not answer in time. The order was marked as failed. Check with the courier before trying again.',
      details: [{ providerId: 'fake', code: 'PROVIDER_TIMEOUT', message: 'No answer within 50 ms' }],
    });
    expect(fake.lastSignal?.aborted).toBe(true);
    expect(fake.calls).toHaveLength(1); // a timeout is not retried: the courier may have created the shipment
    expect((await request(app).get(`/api/orders/${id}`)).body.data.status).toBe('FAILED');
    const last = (await request(app).get(`/api/orders/${id}/events`)).body.data.at(-1);
    expect(last).toMatchObject({ type: 'PROVIDER_TIMEOUT', toStatus: 'FAILED', source: 'provider', code: 'PROVIDER_TIMEOUT' });

    const activity = (await request(app).get('/api/integrations/activity')).body.data;
    expect(activity.operations[0]).toMatchObject({ outcome: 'timedOut', code: 'PROVIDER_TIMEOUT' });
    expect(activity.summary[0]).toMatchObject({ timedOut: 1 });
  });

  it('answers 504 for a tracking lookup that times out, and changes nothing', async () => {
    const { app, orderRepository } = setup();
    const { orderNumber: _n, ...order } = buildOrder({ id: 's-1', status: 'SHIPPED', courierProvider: 'fake', trackingNumber: 'FAKE-1' });
    await orderRepository.create(order);

    const res = await request(app).get('/api/orders/s-1/tracking').expect(504);

    expect(res.body.error.message).toBe('Fake Courier did not answer in time. Nothing was changed; try again later.');
    expect((await request(app).get('/api/orders/s-1')).body.data.status).toBe('SHIPPED');
  });
});
