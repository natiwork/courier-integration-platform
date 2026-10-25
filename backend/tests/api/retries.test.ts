import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { CreatedShipment, ProviderResult } from '../../src/providers/courierProvider.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { validOrderBody } from '../fixtures/orders.js';

const unavailable: ProviderResult<CreatedShipment> = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'Try later' };
const accepted: ProviderResult<CreatedShipment> = {
  kind: 'success',
  value: { trackingNumber: 'FAKE-0003', status: 'SHIPPED', externalStatus: 'accepted' },
};

// Real waits, but tiny ones (1–2 ms, 2–4 ms), so the test is fast and still goes through the real backoff code.
function setup() {
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  const app = createApp({ providerRegistry, retryPolicy: { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 50 } });
  const ship = async (expected: number) => {
    const id = (await request(app).post('/api/orders').send({ ...validOrderBody, paymentStatus: 'PAID' }).expect(201)).body.data.id;
    const res = await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(expected);
    const history = (await request(app).get(`/api/orders/${id}/events`)).body.data;
    return { res, history, id };
  };
  return { app, fake, ship };
}

describe('retrying temporary courier failures', () => {
  it('2 temporary failures, then success: shipped, the courier called 3 times, "attempt 3" recorded', async () => {
    const { app, fake, ship } = setup();
    fake.queue = [unavailable, unavailable, accepted];

    const { res, history } = await ship(200);

    expect(res.body.data).toMatchObject({ status: 'SHIPPED', trackingNumber: 'FAKE-0003' });
    expect(fake.calls).toHaveLength(3);
    // The retries are not separate status changes: PROCESSING once, then SHIPPED with attempts: 3.
    expect(history.map((e: { toStatus: string }) => e.toStatus)).toEqual(['PENDING', 'PROCESSING', 'SHIPPED']);
    expect(history.at(-1)).toMatchObject({ type: 'SHIPMENT_CREATED', attempts: 3 });
    const activity = (await request(app).get('/api/integrations/activity')).body.data;
    expect(activity.operations[0]).toMatchObject({ outcome: 'succeeded', attempts: 3 });
  });

  it('3 temporary failures: FAILED with 502 after exactly 3 calls, never a 4th', async () => {
    const { fake, ship } = setup();
    fake.next = unavailable;

    const { res, history } = await ship(502);

    expect(fake.calls).toHaveLength(3);
    expect(res.body.error.message).toBe('Fake Courier is temporarily unavailable. Tried 3 times. The order was marked as failed; you can try again.');
    expect(history.at(-1)).toMatchObject({ type: 'PROVIDER_UNAVAILABLE', toStatus: 'FAILED', attempts: 3 });
  });

  it('a rejection is not retried: one call, 422', async () => {
    const { fake, ship } = setup();
    fake.next = { kind: 'permanent', code: 'INVALID_ADDRESS', message: 'No such street' };

    const { history } = await ship(422);

    expect(fake.calls).toHaveLength(1);
    expect(history.at(-1)).toMatchObject({ type: 'SHIPMENT_REJECTED', attempts: 1 });
  });

  it('an unexpected error is not retried either: we cannot know whether the shipment was created', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, ship } = setup();
    fake.next = () => {
      throw new Error('socket hang up');
    };

    await ship(502);

    expect(fake.calls).toHaveLength(1);
  });

  it('keeps refusing a parallel ship request while it waits between attempts (409 SHIPMENT_IN_PROGRESS)', async () => {
    const fake = new FakeProvider();
    fake.queue = [unavailable, accepted];
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(fake);
    // One long wait between the attempts, so the second request arrives during the backoff.
    const app = createApp({ providerRegistry, retryPolicy: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 300 }, random: () => 0.999 });
    const id = (await request(app).post('/api/orders').send({ ...validOrderBody, paymentStatus: 'PAID' }).expect(201)).body.data.id;
    const body = { providerId: 'fake', service: 'standard' };

    const first = request(app).post(`/api/orders/${id}/ship`).send(body).then((res) => res);
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    const second = await request(app).post(`/api/orders/${id}/ship`).send(body);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SHIPMENT_IN_PROGRESS');
    expect((await first).status).toBe(200);
    expect(fake.calls).toHaveLength(2);
  });
});
