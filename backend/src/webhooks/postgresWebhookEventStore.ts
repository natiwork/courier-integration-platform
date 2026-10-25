import type { Pool } from '../db/pool.js';
import { query } from '../db/query.js';
import { sleep } from '../lib/sleep.js';
import { WEBHOOK_CLAIM_LEASE_MS, WEBHOOK_DEDUPE_TTL_MS, type Claim, type WebhookEventStore } from './webhookEventStore.js';

export interface PostgresWebhookEventStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  leaseMs?: number;
  pollMs?: number;
}

// The same rules as InMemoryWebhookEventStore, across all server processes. The primary key
// (provider_id, event_id) is what makes a redelivered event a duplicate: only one INSERT can succeed.
export class PostgresWebhookEventStore implements WebhookEventStore {
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly leaseMs: number;
  private readonly pollMs: number;

  constructor(
    private readonly pool: Pool,
    options: PostgresWebhookEventStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? WEBHOOK_DEDUPE_TTL_MS;
    this.leaseMs = options.leaseMs ?? WEBHOOK_CLAIM_LEASE_MS;
    this.pollMs = options.pollMs ?? 100;
  }

  async claim(providerId: string, eventId: string): Promise<Claim> {
    for (;;) {
      const now = this.now();
      // A kept event older than the TTL, or a claim whose owner died, no longer blocks this one.
      await query(
        this.pool,
        `DELETE FROM webhook_events
         WHERE provider_id = $1 AND event_id = $2
           AND ((state = 'kept' AND claimed_at <= $3) OR (state = 'in_flight' AND locked_until <= $4))`,
        [providerId, eventId, new Date(now.getTime() - this.ttlMs), now],
      );
      const inserted = await query(
        this.pool,
        `INSERT INTO webhook_events (provider_id, event_id, state, claimed_at, locked_until)
         VALUES ($1, $2, 'in_flight', $3, $4)
         ON CONFLICT (provider_id, event_id) DO NOTHING`,
        [providerId, eventId, now, new Date(now.getTime() + this.leaseMs)],
      );
      if (inserted.rowCount === 1) {
        return {
          kind: 'new',
          keep: async () => {
            await query(
              this.pool,
              `UPDATE webhook_events SET state = 'kept', locked_until = NULL WHERE provider_id = $1 AND event_id = $2 AND state = 'in_flight'`,
              [providerId, eventId],
            );
          },
          release: async () => {
            await query(this.pool, `DELETE FROM webhook_events WHERE provider_id = $1 AND event_id = $2 AND state = 'in_flight'`, [
              providerId,
              eventId,
            ]);
          },
        };
      }

      const { rows } = await query<{ state: 'in_flight' | 'kept' }>(
        this.pool,
        'SELECT state FROM webhook_events WHERE provider_id = $1 AND event_id = $2',
        [providerId, eventId],
      );
      if (rows[0]?.state === 'kept') return { kind: 'duplicate' };
      // The same event is being handled right now (maybe by another process): wait and look again. If that
      // attempt is released, this copy gets its turn instead of being dropped as a duplicate.
      if (rows[0]?.state === 'in_flight') await sleep(this.pollMs);
    }
  }

  // Removes events older than the TTL and claims whose lease ran out. Run periodically (see server.ts).
  async deleteExpired(): Promise<number> {
    const now = this.now();
    const result = await query(
      this.pool,
      `DELETE FROM webhook_events WHERE (state = 'kept' AND claimed_at <= $1) OR (state = 'in_flight' AND locked_until <= $2)`,
      [new Date(now.getTime() - this.ttlMs), now],
    );
    return result.rowCount ?? 0;
  }
}
