import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { validOrderBody, validOrderTotalCents } from '../fixtures/orders.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');

describe('GET /api/stats/overview', () => {
  it('returns stats computed from the orders created through the API', async () => {
    const app = createApp({ now: () => NOW, demoData: true });
    await request(app).post('/api/orders').send({ ...validOrderBody, paymentStatus: 'PAID' }).expect(201);
    await request(app).post('/api/orders').send(validOrderBody).expect(201);

    const res = await request(app).get('/api/stats/overview').expect(200);
    const stats = res.body.data;

    expect(stats).toMatchObject({
      currency: 'EUR',
      demoData: true,
      totals: { orders: 2, byStatus: { PENDING: 2 } },
      today: { date: '2026-10-24', orders: 2, revenueCents: validOrderTotalCents },
      last30Days: { revenueCents: { current: validOrderTotalCents, previous: 0, changePercent: null } },
      topDestinations: [{ country: 'GB', orders: 2, revenueCents: validOrderTotalCents }],
    });
    expect(stats.monthly).toHaveLength(9);
    expect(stats.monthly[8]).toEqual({ month: '2026-10', orders: 2, revenueCents: validOrderTotalCents });
  });

  it('reports demoData: false unless the app was started with demo data', async () => {
    const res = await request(createApp()).get('/api/stats/overview').expect(200);
    expect(res.body.data.demoData).toBe(false);
  });
});
