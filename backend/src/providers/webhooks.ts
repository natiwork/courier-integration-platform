import crypto from 'node:crypto';
import type { z } from 'zod';
import type { OrderStatus } from '../domain/orderStatus.js';

// Courier webhooks: the courier calls us when a shipment's status changes.
// Each courier has its own payload and header names (WebhookSpec); verifying the signature is shared.
//
// Signature = HMAC-SHA256(secret, timestamp + "." + rawBody), hex encoded. The timestamp is part of what is
// signed, so it can't be changed without breaking the signature; checking its age then stops replays.

export const WEBHOOK_TOLERANCE_SECONDS = 300;

// The fields we need from any courier's payload, whatever their names there.
export interface WebhookEvent {
  eventId: string; // unique per event at the courier: used for deduplication
  trackingNumber: string;
  externalStatus: string; // in the courier's own vocabulary
  occurredAt: string; // ISO 8601
}

export type ParseResult = { ok: true; event: WebhookEvent } | { ok: false; issues: { path: string; message: string }[] };

export interface WebhookSpec {
  signatureHeader: string; // lower case, as Node exposes headers
  timestampHeader: string;
  readSignature(headerValue: string): string | null; // the hex part, or null if the header has the wrong shape
  formatSignature(hex: string): string; // the header value, for the simulator
  parse(body: unknown): ParseResult;
  buildPayload(event: WebhookEvent): unknown; // the courier's JSON shape, for the simulator
  normalizeStatus(externalStatus: string): OrderStatus | null; // the courier's existing status table
  statusCodes: readonly string[]; // every external status it can send
}

// Turns a courier-specific Zod schema into the common shape.
export function parseWith<T>(schema: z.ZodType<T>, toEvent: (payload: T) => WebhookEvent): (body: unknown) => ParseResult {
  return (body) => {
    const result = schema.safeParse(body);
    if (!result.success) {
      return { ok: false, issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })) };
    }
    return { ok: true, event: toEvent(result.data) };
  };
}

export function computeSignature(secret: string, timestamp: string, rawBody: Buffer): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' | 'stale' };

interface VerifyInput {
  secret: string;
  timestamp: string | undefined; // seconds since 1970, as sent
  signature: string | null | undefined; // hex
  rawBody: Buffer; // the exact bytes received: re-serialized JSON could differ in spacing or key order
  now: Date;
  toleranceSeconds?: number;
}

export function verifyWebhookSignature({ secret, timestamp, signature, rawBody, now, toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS }: VerifyInput): VerifyResult {
  if (!timestamp || !signature) return { ok: false, reason: 'missing' };
  // Checked first: timingSafeEqual needs two buffers of the same length, and a 64-character hex string is 32 bytes.
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), 'hex');
  const received = Buffer.from(signature, 'hex');
  // Constant time: `===` stops at the first different character, so an attacker measuring response times
  // could find a valid signature byte by byte. timingSafeEqual always compares all 32 bytes.
  if (!crypto.timingSafeEqual(expected, received)) return { ok: false, reason: 'mismatch' };

  // Only now is the timestamp trusted (it is signed). Too old, or too far in the future: a replay or a bad clock.
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > toleranceSeconds) return { ok: false, reason: 'stale' };
  return { ok: true };
}

// What a courier does before sending: used by our simulator, so it signs exactly the same way.
export function signWebhook(secret: string, rawBody: Buffer, now: Date): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return { timestamp, signature: computeSignature(secret, timestamp, rawBody) };
}
