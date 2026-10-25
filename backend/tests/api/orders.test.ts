import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { configureLogger } from '../../src/lib/logger.js';
import type { OrderRepository } from '../../src/repositories/orderRepository.js';
import { validOrderBody as validOrder, validOrderTotalCents } from '../fixtures/orders.js';

// Checks the shared error format and returns the error for further assertions.
function expectErrorBody(body: unknown, code: string) {
  expect(body).toMatchObject({ error: { code, message: expect.any(String), requestId: expect.any(String) } });
  expect(JSON.stringify(body)).not.toContain('stack');
  return (body as { error: { details?: { path: string; message: string }[] } }).error;
}

describe('Orders API', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp(); // fresh in-memory store for every test
  });

  describe('POST /api/orders', () => {
    it('creates an order: 201, Location header, normalized data', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ ...validOrder, customerName: '  Ada Lovelace ', customerEmail: ' Ada@Example.COM ' })
        .expect(201);

      const order = res.body.data;
      expect(order).toMatchObject({
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
        status: 'PENDING',
        courierProvider: null,
        trackingNumber: null,
      });
      expect(order.orderNumber).toMatch(/^ORD-\d+$/);
      expect(res.headers.location).toBe(`/api/orders/${order.id}`);
    });

    it('returns 400 VALIDATION_ERROR with a detail for every missing field', async () => {
      const res = await request(app).post('/api/orders').send({}).expect(400);

      const error = expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect(error.details?.map((d) => d.path).sort()).toEqual(
        Object.keys(validOrder).sort(),
      );
    });

    it.each([
      ['invalid email', { customerEmail: 'not-an-email' }, 'customerEmail'],
      ['weight as a string', { parcelWeightKg: '2.4' }, 'parcelWeightKg'],
      ['zero weight', { parcelWeightKg: 0 }, 'parcelWeightKg'],
      ['weight above 100 kg', { parcelWeightKg: 100.1 }, 'parcelWeightKg'],
      ['whitespace-only name', { customerName: '   ' }, 'customerName'],
      ['invalid postal code', { postalCode: '12#45' }, 'postalCode'],
    ])('returns 400 for %s', async (_name, override, path) => {
      const res = await request(app).post('/api/orders').send({ ...validOrder, ...override }).expect(400);

      const error = expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect(error.details).toEqual([{ path, message: expect.any(String) }]);
    });

    it('returns 400, not 500, for a 10,000-character string', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ ...validOrder, customerName: 'a'.repeat(10_000) })
        .expect(400);

      const error = expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect(error.details?.[0]?.path).toBe('customerName');
    });

    it('computes totalCents from the items, sets EUR and defaults paymentStatus to UNPAID', async () => {
      const res = await request(app).post('/api/orders').send(validOrder).expect(201);

      expect(res.body.data).toMatchObject({
        totalCents: validOrderTotalCents,
        currency: 'EUR',
        paymentStatus: 'UNPAID',
        destinationCountry: 'GB',
        items: validOrder.items,
      });
    });

    it('accepts an explicit paymentStatus and normalizes SKU and country case', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          ...validOrder,
          paymentStatus: 'PAID',
          destinationCountry: ' gb ',
          items: [{ sku: 'kit-pour-01', name: 'Pour-over set', quantity: 1, unitPriceCents: 1250 }],
        })
        .expect(201);

      expect(res.body.data).toMatchObject({ paymentStatus: 'PAID', destinationCountry: 'GB', totalCents: 1250 });
      expect(res.body.data.items[0].sku).toBe('KIT-POUR-01');
    });

    it.each([
      ['totalCents', { totalCents: 1 }],
      ['currency', { currency: 'USD' }],
    ])('rejects a client-supplied %s', async (_field, extra) => {
      const res = await request(app).post('/api/orders').send({ ...validOrder, ...extra }).expect(400);
      expectErrorBody(res.body, 'VALIDATION_ERROR');
    });

    const item = { sku: 'KIT-POUR-01', name: 'Pour-over set', quantity: 1, unitPriceCents: 1250 };
    it.each([
      ['no items', { items: [] }, 'items'],
      ['an unsupported country', { destinationCountry: 'US' }, 'destinationCountry'],
      ['an invalid payment status', { paymentStatus: 'MAYBE' }, 'paymentStatus'],
      ['an invalid SKU', { items: [{ ...item, sku: 'a b' }] }, 'items.0.sku'],
      ['a zero quantity', { items: [{ ...item, quantity: 0 }] }, 'items.0.quantity'],
      ['a fractional quantity', { items: [{ ...item, quantity: 1.5 }] }, 'items.0.quantity'],
      ['a zero unit price', { items: [{ ...item, unitPriceCents: 0 }] }, 'items.0.unitPriceCents'],
      ['a price given in euros as a string', { items: [{ ...item, unitPriceCents: '12.50' }] }, 'items.0.unitPriceCents'],
    ])('returns 400 for %s', async (_name, override, path) => {
      const res = await request(app).post('/api/orders').send({ ...validOrder, ...override }).expect(400);

      const error = expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect(error.details).toEqual([{ path, message: expect.any(String) }]);
    });

    it('rejects unknown fields inside an item', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ ...validOrder, items: [{ ...item, discount: 50 }] })
        .expect(400);

      const error = expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect(error.details?.[0]?.path).toBe('items.0');
    });

    it('rejects client-supplied system fields', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ ...validOrder, status: 'DELIVERED', trackingNumber: 'FAKE-1' })
        .expect(400);

      expectErrorBody(res.body, 'VALIDATION_ERROR');
      expect((await request(app).get('/api/orders')).body.data).toEqual([]);
    });

    it('returns 400 INVALID_JSON with the same requestId as the X-Request-Id header', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Content-Type', 'application/json')
        .send('{ "customerName": "Ada",')
        .expect(400);

      expectErrorBody(res.body, 'INVALID_JSON');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('returns 413 PAYLOAD_TOO_LARGE, not 500, for a body over 100 KB', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ ...validOrder, customerName: 'a'.repeat(101 * 1024) })
        .expect(413);

      expectErrorBody(res.body, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('GET /api/orders', () => {
    it('returns an empty list initially', async () => {
      const res = await request(app).get('/api/orders').expect(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('returns orders newest first', async () => {
      await request(app).post('/api/orders').send({ ...validOrder, customerName: 'First' }).expect(201);
      await request(app).post('/api/orders').send({ ...validOrder, customerName: 'Second' }).expect(201);

      const res = await request(app).get('/api/orders').expect(200);
      expect(res.body.data.map((o: { customerName: string }) => o.customerName)).toEqual(['Second', 'First']);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns a created order', async () => {
      const created = (await request(app).post('/api/orders').send(validOrder).expect(201)).body.data;

      const res = await request(app).get(`/api/orders/${created.id}`).expect(200);
      expect(res.body.data).toEqual(created);
    });

    it('returns 404 ORDER_NOT_FOUND for an unknown id', async () => {
      const res = await request(app).get('/api/orders/00000000-0000-0000-0000-000000000000').expect(404);
      expectErrorBody(res.body, 'ORDER_NOT_FOUND');
    });
  });

  describe('unknown routes', () => {
    it('returns a JSON 404 ROUTE_NOT_FOUND instead of HTML', async () => {
      const res = await request(app).get('/api/does-not-exist').expect(404).expect('Content-Type', /json/);
      expectErrorBody(res.body, 'ROUTE_NOT_FOUND');
    });

    it('does not reveal the framework in X-Powered-By', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('unexpected errors', () => {
    const secret = 'db password is secret';
    const failingRepository: OrderRepository = {
      create: async () => { throw new Error(secret); },
      findAll: async () => { throw new Error(secret); },
      findById: async () => { throw new Error(secret); },
      findByTrackingNumber: async () => { throw new Error(secret); },
      update: async () => { throw new Error(secret); },
    };
    let logLines: Record<string, unknown>[];

    beforeEach(() => {
      // The real error is logged on purpose; capture the JSON lines instead of printing them.
      logLines = [];
      configureLogger({ level: 'error', sink: (line) => logLines.push(JSON.parse(line)) });
    });

    afterEach(() => {
      configureLogger({ level: 'silent' });
    });

    it.each([
      ['GET /api/orders', (a: Express) => request(a).get('/api/orders')],
      ['GET /api/orders/:id', (a: Express) => request(a).get('/api/orders/some-id')],
      ['POST /api/orders', (a: Express) => request(a).post('/api/orders').send(validOrder)],
    ])('%s returns a generic 500 without leaking internals', async (_name, send) => {
      const res = await send(createApp({ orderRepository: failingRepository })).expect(500);

      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          requestId: res.headers['x-request-id'],
        },
      });
      expect(res.text).not.toContain(secret);
      expect(res.text).not.toContain('stack');
      // ...but the real error does reach the log, tagged with the same requestId.
      expect(logLines).toContainEqual(
        expect.objectContaining({
          level: 'error',
          msg: 'request failed',
          requestId: res.headers['x-request-id'],
          status: 500,
          error: expect.objectContaining({ message: secret, stack: expect.any(String) }),
        }),
      );
    });
  });
});

describe('GET /api/orders/:id/events', () => {
  it('returns the order history, oldest first', async () => {
    const app = createApp();
    const created = await request(app).post('/api/orders').send(validOrder).expect(201);

    const res = await request(app).get(`/api/orders/${created.body.data.id}/events`).expect(200);

    expect(res.body.data).toEqual([
      expect.objectContaining({ type: 'ORDER_CREATED', fromStatus: null, toStatus: 'PENDING', source: 'api' }),
    ]);
  });

  it('returns 404 ORDER_NOT_FOUND for an unknown order', async () => {
    const res = await request(createApp()).get('/api/orders/does-not-exist/events').expect(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});
