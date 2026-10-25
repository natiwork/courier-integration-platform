import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { SUPPORTED_COUNTRIES } from '../../src/domain/countries.js';
import { ORDER_LIMITS } from '../../src/validation/orderSchemas.js';
import { validOrderBody } from '../fixtures/orders.js';

describe('GET /api/meta/order-form', () => {
  it('returns the countries, payment statuses and the exact limits the schema enforces', async () => {
    const res = await request(createApp()).get('/api/meta/order-form').expect(200);

    expect(res.body.data).toEqual({
      countries: [...SUPPORTED_COUNTRIES],
      paymentStatuses: ['PAID', 'UNPAID', 'REFUNDED'],
      limits: { ...ORDER_LIMITS },
    });
  });

  // The limits the form receives must be the ones POST /api/orders applies: test the boundaries.
  it.each([
    ['customerName', { customerName: 'a'.repeat(ORDER_LIMITS.customerNameMax) }, { customerName: 'a'.repeat(ORDER_LIMITS.customerNameMax + 1) }],
    ['parcelWeightKg', { parcelWeightKg: ORDER_LIMITS.parcelWeightKgMax }, { parcelWeightKg: ORDER_LIMITS.parcelWeightKgMax + 0.1 }],
    ['postalCode', { postalCode: 'a'.repeat(ORDER_LIMITS.postalCodeMin) }, { postalCode: 'a'.repeat(ORDER_LIMITS.postalCodeMin - 1) }],
  ])('the published %s limit is the one POST /api/orders enforces', async (_field, ok, tooFar) => {
    const app = createApp();
    await request(app).post('/api/orders').send({ ...validOrderBody, ...ok }).expect(201);
    await request(app).post('/api/orders').send({ ...validOrderBody, ...tooFar }).expect(400);
  });
});

describe('unit price validation message', () => {
  it.each([0, ORDER_LIMITS.unitPriceCentsMax + 1])('speaks euros, not cents, for %i', async (unitPriceCents) => {
    const res = await request(createApp())
      .post('/api/orders')
      .send({ ...validOrderBody, items: [{ sku: 'MUG-1', name: 'Mug', quantity: 1, unitPriceCents }] })
      .expect(400);

    expect(res.body.error.details).toEqual([
      { path: 'items.0.unitPriceCents', message: 'Unit price must be between €0.01 and €100,000.00' },
    ]);
  });
});
