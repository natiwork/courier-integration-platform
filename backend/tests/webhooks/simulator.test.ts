import { describe, expect, it } from 'vitest';
import { NORDCARGO_WEBHOOK } from '../../src/providers/nordCargo.js';
import { SWIFTPARCEL_WEBHOOK } from '../../src/providers/swiftParcel.js';
import { verifyWebhookSignature } from '../../src/providers/webhooks.js';
import { buildSimulatedWebhook } from '../../src/webhooks/simulator.js';

const SECRET = 'sim-secret-'.padEnd(64, 'q');
const NOW = new Date('2026-10-24T12:00:00.000Z');

function verify(webhook: ReturnType<typeof buildSimulatedWebhook>, spec = SWIFTPARCEL_WEBHOOK) {
  return verifyWebhookSignature({
    secret: SECRET,
    timestamp: webhook.headers[spec.timestampHeader],
    signature: spec.readSignature(webhook.headers[spec.signatureHeader]!),
    rawBody: webhook.rawBody,
    now: NOW,
  });
}

describe('buildSimulatedWebhook', () => {
  it.each([
    ['SwiftParcel', SWIFTPARCEL_WEBHOOK, 'in_transit'],
    ['NordCargo', NORDCARGO_WEBHOOK, 'NC20'],
  ])('builds a %s request that passes the real signature check, in its own format', (_name, spec, status) => {
    const webhook = buildSimulatedWebhook({ spec, secret: SECRET, trackingNumber: 'T-1', externalStatus: status, eventId: 'evt_1', now: NOW });
    expect(verify(webhook, spec)).toEqual({ ok: true });
    expect(spec.parse(JSON.parse(webhook.rawBody.toString()))).toEqual({
      ok: true,
      event: { eventId: 'evt_1', trackingNumber: 'T-1', externalStatus: status, occurredAt: NOW.toISOString() },
    });
  });

  it('can sign an old request or break the signature, to show the protections', () => {
    const base = { spec: SWIFTPARCEL_WEBHOOK, secret: SECRET, trackingNumber: 'T-1', externalStatus: 'in_transit', now: NOW };
    expect(verify(buildSimulatedWebhook({ ...base, ageSeconds: 600 }))).toEqual({ ok: false, reason: 'stale' });
    expect(verify(buildSimulatedWebhook({ ...base, tamper: true }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('gives every simulated event a new id unless one is given', () => {
    const base = { spec: SWIFTPARCEL_WEBHOOK, secret: SECRET, trackingNumber: 'T-1', externalStatus: 'in_transit', now: NOW };
    expect(buildSimulatedWebhook(base).eventId).not.toBe(buildSimulatedWebhook(base).eventId);
  });
});
