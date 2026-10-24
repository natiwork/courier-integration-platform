import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { OrderRepository } from '../../src/repositories/orderRepository.js';

const validOrder = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  deliveryAddress: '12 Analytical Street',
  destinationCity: 'London',
  postalCode: 'N1 9GU',
  parcelWeightKg: 2.4,
};

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
      update: async () => { throw new Error(secret); },
    };
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // The real error is logged on purpose; silence it in test output but keep it inspectable.
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
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
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(res.headers['x-request-id'] as string),
        expect.objectContaining({ message: secret }),
      );
    });
  });
});
