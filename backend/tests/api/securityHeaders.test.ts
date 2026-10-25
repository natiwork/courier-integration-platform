import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('security headers', () => {
  const app = createApp();

  it.each([
    ['a normal answer', '/api/orders', 200],
    ['an error', '/api/orders/missing', 404],
    ['an unknown route', '/api/nope', 404],
  ])('are sent on %s', async (_label, path, status) => {
    const res = await request(app).get(path).expect(status);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // Same origin only (the frontend is served through a proxy): no CORS headers at all.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('are sent on webhook answers too', async () => {
    const res = await request(app).post('/api/webhooks/swiftparcel').send('{}');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
