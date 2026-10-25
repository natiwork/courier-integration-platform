import { randomUUID } from 'node:crypto';
import { signWebhook, type WebhookSpec } from '../providers/webhooks.js';

// Builds a webhook request exactly as the courier would send it: the courier's own JSON shape, the courier's
// header names, signed with the shared secret over timestamp + "." + body. Used by the CLI and the dev endpoint.
// The point of a simulator is to exercise the real checks, so nothing here bypasses them.

export interface SimulatedWebhook {
  headers: Record<string, string>;
  rawBody: Buffer;
  eventId: string;
}

export interface SimulateInput {
  spec: WebhookSpec;
  secret: string;
  trackingNumber: string;
  externalStatus: string;
  eventId?: string; // reuse one to test deduplication
  now?: Date;
  ageSeconds?: number; // sign as if sent this long ago, to test the replay window
  tamper?: boolean; // break the signature on purpose, to test the 401
}

export function buildSimulatedWebhook({
  spec,
  secret,
  trackingNumber,
  externalStatus,
  eventId = `evt_sim_${randomUUID()}`,
  now = new Date(),
  ageSeconds = 0,
  tamper = false,
}: SimulateInput): SimulatedWebhook {
  const signedAt = new Date(now.getTime() - ageSeconds * 1000);
  const payload = spec.buildPayload({ eventId, trackingNumber, externalStatus, occurredAt: signedAt.toISOString() });
  const rawBody = Buffer.from(JSON.stringify(payload));
  const { timestamp, signature } = signWebhook(secret, rawBody, signedAt);
  // Flip the last hex digit: still well-formed, no longer valid.
  const sent = tamper ? signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0') : signature;
  return {
    eventId,
    rawBody,
    headers: {
      'content-type': 'application/json',
      [spec.signatureHeader]: spec.formatSignature(sent),
      [spec.timestampHeader]: timestamp,
    },
  };
}
