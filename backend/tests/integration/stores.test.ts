import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresIdempotencyStore } from '../../src/idempotency/postgresIdempotencyStore.js';
import { PostgresWebhookEventStore } from '../../src/webhooks/postgresWebhookEventStore.js';
import { PostgresWebhookLog } from '../../src/webhooks/postgresWebhookLog.js';
import { WEBHOOK_OUTCOMES, type WebhookReceipt } from '../../src/webhooks/webhookLog.js';
import { idempotencyStoreContract } from '../contracts/idempotencyStore.contract.js';
import { webhookEventStoreContract } from '../contracts/webhookEventStore.contract.js';
import { createTestPool, resetDatabase } from './support/db.js';

const pool = createTestPool();
afterAll(() => pool.end());

// pollMs 10: waiting requests look again quickly, so the tests stay fast.
idempotencyStoreContract('PostgresIdempotencyStore', async (now, ttlMs) => {
  await resetDatabase(pool);
  return new PostgresIdempotencyStore(pool, { now, ttlMs, pollMs: 10 });
});

webhookEventStoreContract('PostgresWebhookEventStore', async (now, ttlMs) => {
  await resetDatabase(pool);
  return new PostgresWebhookEventStore(pool, { now, ttlMs, pollMs: 10 });
});

describe('leases: a claim left behind by a process that died', () => {
  it('lets another request take over an idempotency key after the lease, not before', async () => {
    await resetDatabase(pool);
    let now = new Date('2026-10-24T00:00:00.000Z');
    const store = new PostgresIdempotencyStore(pool, { now: () => now, leaseMs: 60_000, pollMs: 10 });
    await store.begin('key-1', 'fp'); // the owner "crashes": complete() is never called

    const waiting = await store.begin('key-1', 'fp');
    expect(waiting.kind).toBe('wait');
    now = new Date(now.getTime() + 60_000);
    if (waiting.kind === 'wait') expect(await waiting.done).toBeNull(); // gives up waiting once the lease is over
    expect((await store.begin('key-1', 'fp')).kind).toBe('new');
  });

  it('lets a redelivered webhook take over a claim after the lease', async () => {
    await resetDatabase(pool);
    let now = new Date('2026-10-24T00:00:00.000Z');
    const store = new PostgresWebhookEventStore(pool, { now: () => now, leaseMs: 60_000, pollMs: 10 });
    await store.claim('swiftparcel', 'evt_1'); // never kept or released

    now = new Date(now.getTime() + 60_000);
    expect((await store.claim('swiftparcel', 'evt_1')).kind).toBe('new');
  });

  it('cleans up expired answers and abandoned claims', async () => {
    await resetDatabase(pool);
    let now = new Date('2026-10-24T00:00:00.000Z');
    const keys = new PostgresIdempotencyStore(pool, { now: () => now, ttlMs: 1000, leaseMs: 1000 });
    const events = new PostgresWebhookEventStore(pool, { now: () => now, ttlMs: 1000, leaseMs: 1000 });
    const done = await keys.begin('done', 'fp');
    if (done.kind === 'new') await done.complete({ status: 200, body: {} });
    await keys.begin('abandoned', 'fp');
    const kept = await events.claim('nordcargo', 'evt_1');
    if (kept.kind === 'new') await kept.keep();

    expect(await keys.deleteExpired()).toBe(0);
    now = new Date(now.getTime() + 1000);
    expect(await keys.deleteExpired()).toBe(2);
    expect(await events.deleteExpired()).toBe(1);
  });
});

describe('PostgresWebhookLog', () => {
  it('keeps every receipt, newest first, and allows exactly the outcomes the code uses', async () => {
    await resetDatabase(pool);
    const log = new PostgresWebhookLog(pool);
    const receipt = (id: string, outcome: WebhookReceipt['outcome']): WebhookReceipt => ({
      id,
      receivedAt: '2026-10-24T00:00:00.000Z',
      providerId: 'swiftparcel',
      outcome,
      requestId: 'req-1',
      eventId: null,
      trackingNumber: null,
      externalStatus: null,
      status: null,
      orderId: null,
    });
    const first = receipt(randomUUID(), 'invalid_signature');
    const second = { ...receipt(randomUUID(), 'accepted'), eventId: 'evt_1', trackingNumber: 'SP1', externalStatus: 'in_transit', status: 'IN_TRANSIT' as const };
    await log.append(first);
    await log.append(second);

    expect(await log.recent()).toEqual([second, first]);
    expect(await log.recent(1)).toEqual([second]);

    const { rows } = await pool.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'webhook_receipts_outcome_check'",
    );
    const allowed = [...rows[0]!.def.matchAll(/'([^']+)'::text/g)].map((match) => match[1]).sort();
    expect(allowed).toEqual([...WEBHOOK_OUTCOMES].sort());
  });
});
