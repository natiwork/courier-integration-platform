import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NORDCARGO_WEBHOOK } from '../../src/providers/nordCargo.js';
import { SWIFTPARCEL_WEBHOOK } from '../../src/providers/swiftParcel.js';
import { computeSignature, signWebhook, verifyWebhookSignature } from '../../src/providers/webhooks.js';

const SECRET = 'test-secret-'.padEnd(64, 'x');
const NOW = new Date('2026-10-24T12:00:00.000Z');
const nowSeconds = NOW.getTime() / 1000;
const body = Buffer.from('{"id":"evt_1","tracking_number":"SP0000000001","status":"in_transit","occurred_at":"2026-10-24T11:59:00.000Z"}');

function signed(overrides: { timestamp?: string; secret?: string; rawBody?: Buffer } = {}) {
  const timestamp = overrides.timestamp ?? String(nowSeconds);
  return { timestamp, signature: computeSignature(overrides.secret ?? SECRET, timestamp, overrides.rawBody ?? body) };
}
const verify = (input: { timestamp?: string; signature?: string | null }, rawBody = body) =>
  verifyWebhookSignature({ secret: SECRET, rawBody, now: NOW, timestamp: input.timestamp, signature: input.signature });

describe('verifyWebhookSignature', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a signature made with the shared secret over timestamp + "." + body', () => {
    const expected = crypto.createHmac('sha256', SECRET).update(`${nowSeconds}.${body.toString()}`).digest('hex');
    expect(signed().signature).toBe(expected);
    expect(verify(signed())).toEqual({ ok: true });
  });

  it('rejects a signature made with another secret', () => {
    expect(verify(signed({ secret: 'someone-else'.padEnd(64, 'y') }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a body changed by a single byte after signing', () => {
    const tampered = Buffer.from(body);
    tampered[tampered.indexOf('in_transit')] = 'I'.charCodeAt(0);
    expect(verify(signed(), tampered)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects the same JSON re-serialized differently: the bytes are what is signed', () => {
    const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verify(signed(), reformatted)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a changed timestamp, because the timestamp is signed too', () => {
    const { signature } = signed();
    expect(verify({ timestamp: String(nowSeconds - 1), signature })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it.each([
    [{ timestamp: undefined, signature: 'a'.repeat(64) }, 'missing'],
    [{ timestamp: String(nowSeconds), signature: null }, 'missing'],
    [{ timestamp: String(nowSeconds), signature: 'z'.repeat(64) }, 'malformed'],
    [{ timestamp: String(nowSeconds), signature: 'a'.repeat(63) }, 'malformed'],
    [{ timestamp: 'yesterday', signature: 'a'.repeat(64) }, 'malformed'],
  ])('rejects %o as %s before comparing anything', (input, reason) => {
    expect(verify(input)).toEqual({ ok: false, reason });
  });

  it('accepts a timestamp exactly 300 s old or ahead, and rejects one second more (replay protection)', () => {
    expect(verify(signed({ timestamp: String(nowSeconds - 300) }))).toEqual({ ok: true });
    expect(verify(signed({ timestamp: String(nowSeconds + 300) }))).toEqual({ ok: true });
    expect(verify(signed({ timestamp: String(nowSeconds - 301) }))).toEqual({ ok: false, reason: 'stale' });
    expect(verify(signed({ timestamp: String(nowSeconds + 301) }))).toEqual({ ok: false, reason: 'stale' });
  });

  it('compares signatures with crypto.timingSafeEqual, on two 32-byte buffers', () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    verify(signed());
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0]!;
    expect([(a as Buffer).length, (b as Buffer).length]).toEqual([32, 32]);
  });
});

describe('signWebhook', () => {
  it('signs exactly what verifyWebhookSignature checks (a round trip)', () => {
    const { timestamp, signature } = signWebhook(SECRET, body, NOW);
    expect(timestamp).toBe(String(nowSeconds));
    expect(verify({ timestamp, signature })).toEqual({ ok: true });
  });
});

describe('courier webhook formats', () => {
  const event = { eventId: 'evt_9', trackingNumber: 'XX-1', externalStatus: 'code', occurredAt: '2026-10-24T11:00:00.000Z' };

  it.each([
    ['SwiftParcel', SWIFTPARCEL_WEBHOOK, { id: 'evt_9', tracking_number: 'XX-1', status: 'code', occurred_at: '2026-10-24T11:00:00.000Z' }],
    ['NordCargo', NORDCARGO_WEBHOOK, { eventId: 'evt_9', shipment: { trackingNo: 'XX-1' }, eventCode: 'code', eventTime: '2026-10-24T11:00:00.000Z' }],
  ])('%s: builds its own payload shape and parses it back into the common fields', (_name, spec, payload) => {
    expect(spec.buildPayload(event)).toEqual(payload);
    expect(spec.parse(payload)).toEqual({ ok: true, event });
  });

  it('reads each courier signature header in its own format', () => {
    expect(SWIFTPARCEL_WEBHOOK.readSignature(`sha256=${'a'.repeat(64)}`)).toBe('a'.repeat(64));
    expect(SWIFTPARCEL_WEBHOOK.readSignature('a'.repeat(64))).toBeNull();
    expect(NORDCARGO_WEBHOOK.readSignature('b'.repeat(64))).toBe('b'.repeat(64));
  });

  it('normalizes with the existing status tables', () => {
    expect(SWIFTPARCEL_WEBHOOK.normalizeStatus('out_for_delivery')).toBe('IN_TRANSIT');
    expect(NORDCARGO_WEBHOOK.normalizeStatus('NC40')).toBe('DELIVERED');
    expect(NORDCARGO_WEBHOOK.normalizeStatus('delivered')).toBeNull();
  });

  it('reports field problems for a payload in the wrong shape', () => {
    const result = NORDCARGO_WEBHOOK.parse({ eventId: 'e', eventCode: 'NC20', eventTime: 'soon' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toEqual(['shipment', 'eventTime']);
  });
});
