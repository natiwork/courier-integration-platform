import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Order } from '../../src/domain/order.js';
import { configureLogger } from '../../src/lib/logger.js';
import { NORDCARGO_WEBHOOK } from '../../src/providers/nordCargo.js';
import { SWIFTPARCEL_WEBHOOK } from '../../src/providers/swiftParcel.js';
import { signWebhook, type WebhookSpec } from '../../src/providers/webhooks.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { InMemoryWebhookLog } from '../../src/webhooks/webhookLog.js';
import { buildOrder } from '../fixtures/orders.js';

const SECRETS = { swiftparcel: 'swift-secret-'.padEnd(64, 's'), nordcargo: 'nord-secret-'.padEnd(64, 'n') };
const SPECS: Record<string, WebhookSpec> = { swiftparcel: SWIFTPARCEL_WEBHOOK, nordcargo: NORDCARGO_WEBHOOK };

let eventCounter = 0;

function setup(secrets: Record<string, string | undefined> = SECRETS) {
  const orderRepository = new InMemoryOrderRepository();
  const webhookLog = new InMemoryWebhookLog();
  const app = createApp({ orderRepository, webhookSecrets: secrets, webhookLog });

  async function order(overrides: Partial<Order>): Promise<string> {
    const { orderNumber: _n, ...stored } = buildOrder({ status: 'SHIPPED', courierProvider: 'swiftparcel', trackingNumber: 'SP0000000001', ...overrides });
    return (await orderRepository.create(stored)).id;
  }

  // Exactly what the courier sends: its own JSON shape, signed over timestamp + "." + the raw body.
  function send(providerId: string, fields: { trackingNumber: string; externalStatus: string; eventId?: string }, options: { secret?: string; ageSeconds?: number } = {}) {
    const spec = SPECS[providerId]!;
    const eventId = fields.eventId ?? `evt_${++eventCounter}`;
    const raw = JSON.stringify(spec.buildPayload({ eventId, occurredAt: new Date().toISOString(), ...fields }));
    const signedAt = new Date(Date.now() - (options.ageSeconds ?? 0) * 1000);
    const { timestamp, signature } = signWebhook(options.secret ?? SECRETS[providerId as keyof typeof SECRETS], Buffer.from(raw), signedAt);
    return request(app)
      .post(`/api/webhooks/${providerId}`)
      .set('Content-Type', 'application/json')
      .set(spec.signatureHeader, spec.formatSignature(signature))
      .set(spec.timestampHeader, timestamp)
      .send(raw);
  }

  const get = async (id: string) => (await request(app).get(`/api/orders/${id}`)).body.data;
  const history = async (id: string) => (await request(app).get(`/api/orders/${id}/events`)).body.data;
  return { app, order, send, get, history, orderRepository, webhookLog };
}

describe('POST /api/webhooks/:providerId', () => {
  afterEach(() => {
    configureLogger({ level: 'silent' });
  });

  it('applies a correctly signed update: new status, recorded as a webhook event', async () => {
    const t = setup();
    const id = await t.order({});

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit', eventId: 'evt_a' }).expect(200);

    expect(res.body).toEqual({ data: { status: 'accepted', eventId: 'evt_a' } });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect((await t.get(id)).status).toBe('IN_TRANSIT');
    expect((await t.history(id)).at(-1)).toMatchObject({
      type: 'STATUS_CHANGED',
      fromStatus: 'SHIPPED',
      toStatus: 'IN_TRANSIT',
      source: 'webhook',
      providerId: 'swiftparcel',
      message: 'SwiftParcel reported in_transit',
    });
    expect((await t.webhookLog.recent())[0]).toMatchObject({ outcome: 'accepted', eventId: 'evt_a', orderId: id, status: 'IN_TRANSIT' });
  });

  it("understands NordCargo's own format and event codes", async () => {
    const t = setup();
    const id = await t.order({ status: 'IN_TRANSIT', courierProvider: 'nordcargo', trackingNumber: 'NC-0000000001' });

    await t.send('nordcargo', { trackingNumber: 'NC-0000000001', externalStatus: 'NC40' }).expect(200);

    expect((await t.get(id)).status).toBe('DELIVERED');
  });

  it('refuses a wrong signature with 401, changes nothing, and logs the attempt without trusting the body', async () => {
    const t = setup();
    const id = await t.order({});

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'delivered' }, { secret: 'attacker-'.padEnd(64, 'a') }).expect(401);

    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    expect((await t.get(id)).status).toBe('SHIPPED');
    expect(await t.history(id)).toHaveLength(0);
    expect((await t.webhookLog.recent())[0]).toMatchObject({ outcome: 'invalid_signature', eventId: null, trackingNumber: null, orderId: null });
  });

  it('refuses a request without signature headers with 401', async () => {
    const t = setup();
    const res = await request(t.app).post('/api/webhooks/swiftparcel').set('Content-Type', 'application/json').send('{}').expect(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('refuses a correctly signed but 10-minute-old request with 401 STALE_WEBHOOK (replay protection)', async () => {
    const t = setup();
    const id = await t.order({});

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit' }, { ageSeconds: 600 }).expect(401);

    expect(res.body.error.code).toBe('STALE_WEBHOOK');
    expect((await t.get(id)).status).toBe('SHIPPED');
  });

  it('answers a redelivered event with 200 "duplicate" and records nothing new', async () => {
    const t = setup();
    const id = await t.order({});
    await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit', eventId: 'evt_dup' }).expect(200);

    const again = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit', eventId: 'evt_dup' }).expect(200);

    expect(again.body.data).toEqual({ status: 'duplicate', eventId: 'evt_dup' });
    expect((await t.history(id)).filter((e: { source: string }) => e.source === 'webhook')).toHaveLength(1);
  });

  it('handles parallel copies of one event once', async () => {
    const t = setup();
    const id = await t.order({});
    const results = await Promise.all(
      Array.from({ length: 4 }, () => t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit', eventId: 'evt_par' })),
    );

    expect(results.map((res) => res.body.data.status).sort()).toEqual(['accepted', 'duplicate', 'duplicate', 'duplicate']);
    expect((await t.history(id)).filter((e: { source: string }) => e.source === 'webhook')).toHaveLength(1);
  });

  it('answers 404 for an unknown tracking number, so the courier retries', async () => {
    const t = setup();
    const res = await t.send('swiftparcel', { trackingNumber: 'SP9999999999', externalStatus: 'in_transit' }).expect(404);
    expect(res.body.error.code).toBe('UNKNOWN_TRACKING_NUMBER');
    expect((await t.webhookLog.recent())[0]).toMatchObject({ outcome: 'unknown_tracking', orderId: null });
  });

  it('applies the retry of an event that arrived before our tracking number was saved (the 404 released it)', async () => {
    const t = setup();
    // The courier's webhook overtakes our own write of the tracking number…
    await t.send('swiftparcel', { trackingNumber: 'SP0000000077', externalStatus: 'in_transit', eventId: 'evt_early' }).expect(404);
    // …which then lands…
    const id = await t.order({ trackingNumber: 'SP0000000077' });
    // …and the courier's retry of the same event is applied, not dropped as a duplicate.
    const retry = await t.send('swiftparcel', { trackingNumber: 'SP0000000077', externalStatus: 'in_transit', eventId: 'evt_early' }).expect(200);

    expect(retry.body.data.status).toBe('accepted');
    expect((await t.get(id)).status).toBe('IN_TRANSIT');
  });

  it('answers 200 to a forbidden transition and records a warning on the order instead', async () => {
    const t = setup();
    const id = await t.order({ status: 'CANCELLED', trackingNumber: 'SP0000000002' });

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000002', externalStatus: 'delivered', eventId: 'evt_bad' }).expect(200);

    expect(res.body.data).toEqual({ status: 'ignored', reason: 'invalid_transition', eventId: 'evt_bad' });
    expect((await t.get(id)).status).toBe('CANCELLED');
    expect((await t.history(id)).at(-1)).toMatchObject({
      type: 'WEBHOOK_IGNORED',
      fromStatus: 'CANCELLED',
      toStatus: 'CANCELLED',
      source: 'webhook',
      code: 'INVALID_TRANSITION',
      message: 'SwiftParcel reported delivered (DELIVERED), but the order is CANCELLED: ignored (event evt_bad)',
    });
    // Final outcome: a redelivery is a duplicate, not a second warning.
    await t.send('swiftparcel', { trackingNumber: 'SP0000000002', externalStatus: 'delivered', eventId: 'evt_bad' }).expect(200);
    expect((await t.history(id)).filter((e: { type: string }) => e.type === 'WEBHOOK_IGNORED')).toHaveLength(1);
  });

  it('answers 200 "unchanged" when the courier status means the same for us', async () => {
    const t = setup();
    const id = await t.order({ status: 'IN_TRANSIT' });

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'out_for_delivery' }).expect(200);

    expect(res.body.data.status).toBe('unchanged');
    expect(await t.history(id)).toHaveLength(0);
  });

  it('records an unknown courier status as a warning (200), since a retry would not help', async () => {
    const t = setup();
    const id = await t.order({});

    const res = await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'teleported' }).expect(200);

    expect(res.body.data).toMatchObject({ status: 'ignored', reason: 'unmapped_status' });
    expect((await t.history(id)).at(-1)).toMatchObject({ type: 'WEBHOOK_IGNORED', code: 'UNMAPPED_STATUS' });
  });

  it('refuses a signed body that is not a valid event with 400 and the field problems', async () => {
    const t = setup();
    const raw = '{"id":"evt_x","status":"in_transit"}';
    const { timestamp, signature } = signWebhook(SECRETS.swiftparcel, Buffer.from(raw), new Date());

    const res = await request(t.app)
      .post('/api/webhooks/swiftparcel')
      .set('x-swiftparcel-signature', `sha256=${signature}`)
      .set('x-swiftparcel-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_WEBHOOK_PAYLOAD');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['tracking_number', 'occurred_at']);
  });

  it('answers 503 when no secret is configured for the courier, and 404 for an unknown courier', async () => {
    const t = setup({ swiftparcel: SECRETS.swiftparcel });
    expect((await t.send('nordcargo', { trackingNumber: 'NC-1', externalStatus: 'NC20' }).expect(503)).body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    await request(t.app).post('/api/webhooks/parcelpigeon').send('{}').expect(404);
  });

  it('logs the webhook without personal data', async () => {
    const lines: string[] = [];
    configureLogger({ level: 'debug', sink: (line) => lines.push(line) });
    const t = setup();
    await t.order({ customerName: 'Ingrid Halvorsen', customerEmail: 'ingrid@example.com', deliveryAddress: 'Markveien 58' });

    await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit', eventId: 'evt_log' }).expect(200);

    const entry = lines.map((line) => JSON.parse(line)).find((line) => line.msg === 'webhook received');
    expect(entry).toMatchObject({ provider: 'swiftparcel', outcome: 'accepted', eventId: 'evt_log', requestId: expect.any(String) });
    expect(lines.join('\n')).not.toMatch(/Ingrid|Halvorsen|ingrid@example\.com|Markveien/);
  });

  it('counts a webhook update in "Updated today" and keeps a warning out of it', async () => {
    const t = setup();
    await t.order({});
    await t.order({ status: 'CANCELLED', trackingNumber: 'SP0000000003' });
    await t.send('swiftparcel', { trackingNumber: 'SP0000000001', externalStatus: 'in_transit' }).expect(200);
    await t.send('swiftparcel', { trackingNumber: 'SP0000000003', externalStatus: 'delivered' }).expect(200);

    const stats = (await request(t.app).get('/api/stats/overview')).body.data;
    expect(stats.today.activity).toMatchObject({ IN_TRANSIT: 1, CANCELLED: 0, DELIVERED: 0 });
  });
});
