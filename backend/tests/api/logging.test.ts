import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { configureLogger } from '../../src/lib/logger.js';
import type { CreatedShipment, ProviderResult } from '../../src/providers/courierProvider.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';

// Personal data that must never appear in a log line.
const customer = {
  customerName: 'Ingrid Halvorsen',
  customerEmail: 'ingrid.halvorsen@example.com',
  deliveryAddress: 'Markveien 58',
  destinationCity: 'Oslo',
  postalCode: '0554',
  destinationCountry: 'NO',
  parcelWeightKg: 1.4,
  paymentStatus: 'PAID',
  items: [{ sku: 'THROW-WOOL-11', name: 'Wool throw blanket', quantity: 1, unitPriceCents: 8900 }],
};
const unavailable: ProviderResult<CreatedShipment> = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'Try later' };

describe('structured logs', () => {
  afterEach(() => {
    configureLogger({ level: 'silent' });
  });

  it('traces a request: every courier attempt and the request line share its X-Request-Id, with no personal data', async () => {
    const lines: Record<string, unknown>[] = [];
    const raw: string[] = [];
    configureLogger({
      level: 'debug',
      sink: (line) => {
        raw.push(line);
        lines.push(JSON.parse(line));
      },
    });
    const fake = new FakeProvider();
    fake.queue = [unavailable, unavailable];
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(fake);
    const app = createApp({ providerRegistry, retryPolicy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 } });

    const id = (await request(app).post('/api/orders').send(customer).expect(201)).body.data.id;
    await request(app).get(`/api/orders?search=${encodeURIComponent('Ingrid Halvorsen')}`).expect(200);
    const shipped = await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'fake', service: 'standard' }).expect(200);
    const requestId = shipped.headers['x-request-id'];

    const ofShip = lines.filter((line) => line.requestId === requestId);
    expect(ofShip.map((line) => [line.msg, line.attempt ?? null, line.outcome ?? null, line.code ?? null])).toEqual([
      ['courier call', 1, 'transient', 'PROVIDER_UNAVAILABLE'],
      ['courier call', 2, 'transient', 'PROVIDER_UNAVAILABLE'],
      ['courier call', 3, 'success', null],
      ['request finished', null, null, null],
    ]);
    expect(ofShip[0]).toMatchObject({ level: 'warn', provider: 'fake', operation: 'createShipment', orderId: id, durationMs: expect.any(Number) });
    expect(ofShip[3]).toMatchObject({ method: 'POST', path: `/api/orders/${id}/ship`, status: 200 });

    const everything = raw.join('\n');
    for (const value of [customer.customerName, 'Ingrid', 'Halvorsen', customer.customerEmail, customer.deliveryAddress, customer.postalCode]) {
      expect(everything).not.toContain(value);
    }
    // The search request is logged by its path only, never its query.
    expect(lines).toContainEqual(expect.objectContaining({ msg: 'request finished', path: '/api/orders', method: 'GET' }));
  });
});
