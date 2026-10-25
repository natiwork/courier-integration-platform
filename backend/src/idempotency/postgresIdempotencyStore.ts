import type { Pool } from '../db/pool.js';
import { query } from '../db/query.js';
import { sleep } from '../lib/sleep.js';
import {
  IDEMPOTENCY_LEASE_MS,
  IDEMPOTENCY_TTL_MS,
  type BeginResult,
  type IdempotencyStore,
  type StoredResponse,
} from './idempotencyStore.js';

interface KeyRow {
  fingerprint: string;
  state: 'in_flight' | 'done';
  response_status: number | null;
  response_body: unknown;
  response_location: string | null;
  locked_until: Date | null;
}

export interface PostgresIdempotencyStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  leaseMs?: number;
  pollMs?: number; // how often a waiting request looks again
}

function toResponse(row: KeyRow): StoredResponse {
  return {
    status: row.response_status!,
    body: row.response_body,
    ...(row.response_location !== null && { location: row.response_location }),
  };
}

// The same rules as InMemoryIdempotencyStore, shared by every server process that uses the database:
//   claim   INSERT ... ON CONFLICT (key) DO NOTHING: of two requests with the same key exactly one inserts the
//           row; the primary key decides, not our code.
//   wait    a request in another process can't wake us up, so the waiting one reads the row again every pollMs.
//   lease   locked_until: if the owner's process died, the key is taken over after the lease instead of
//           blocking the retry forever.
export class PostgresIdempotencyStore implements IdempotencyStore {
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly leaseMs: number;
  private readonly pollMs: number;

  constructor(
    private readonly pool: Pool,
    options: PostgresIdempotencyStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS;
    this.leaseMs = options.leaseMs ?? IDEMPOTENCY_LEASE_MS;
    this.pollMs = options.pollMs ?? 100;
  }

  async begin(key: string, fingerprint: string): Promise<BeginResult> {
    for (;;) {
      const now = this.now();
      // An expired answer or an abandoned claim no longer counts: remove it, so the INSERT below can win.
      await query(
        this.pool,
        `DELETE FROM idempotency_keys
         WHERE key = $1 AND ((state = 'done' AND created_at <= $2) OR (state = 'in_flight' AND locked_until <= $3))`,
        [key, new Date(now.getTime() - this.ttlMs), now],
      );
      const inserted = await query(
        this.pool,
        `INSERT INTO idempotency_keys (key, fingerprint, state, created_at, locked_until)
         VALUES ($1, $2, 'in_flight', $3, $4)
         ON CONFLICT (key) DO NOTHING`,
        [key, fingerprint, now, new Date(now.getTime() + this.leaseMs)],
      );
      if (inserted.rowCount === 1) return { kind: 'new', complete: (response) => this.complete(key, response) };

      const row = await this.read(key);
      if (!row) continue; // removed in between (released): try to claim it again
      if (row.fingerprint !== fingerprint) return { kind: 'mismatch' };
      if (row.state === 'done') return { kind: 'replay', response: toResponse(row) };
      return { kind: 'wait', done: this.waitFor(key) };
    }
  }

  // Removes answers older than the TTL and claims whose lease ran out. Run periodically (see server.ts).
  async deleteExpired(): Promise<number> {
    const now = this.now();
    const result = await query(
      this.pool,
      `DELETE FROM idempotency_keys
       WHERE (state = 'done' AND created_at <= $1) OR (state = 'in_flight' AND locked_until <= $2)`,
      [new Date(now.getTime() - this.ttlMs), now],
    );
    return result.rowCount ?? 0;
  }

  private async complete(key: string, response: StoredResponse | null): Promise<void> {
    if (response) {
      await query(
        this.pool,
        `UPDATE idempotency_keys
         SET state = 'done', response_status = $2, response_body = $3, response_location = $4, locked_until = NULL
         WHERE key = $1 AND state = 'in_flight'`,
        // JSON.stringify: the driver would turn a top-level array into a PostgreSQL array, not JSON.
        [key, response.status, JSON.stringify(response.body), response.location ?? null],
      );
    } else {
      // Nothing worth keeping (an unexpected 500): forget the key, so the client's retry can do the work.
      await query(this.pool, `DELETE FROM idempotency_keys WHERE key = $1 AND state = 'in_flight'`, [key]);
    }
  }

  private async read(key: string): Promise<KeyRow | undefined> {
    const { rows } = await query<KeyRow>(
      this.pool,
      'SELECT fingerprint, state, response_status, response_body, response_location, locked_until FROM idempotency_keys WHERE key = $1',
      [key],
    );
    return rows[0];
  }

  // Resolves with the first request's answer, or null when it stored nothing or its lease ran out
  // (the middleware then calls begin() again and may take the key over).
  private async waitFor(key: string): Promise<StoredResponse | null> {
    for (;;) {
      await sleep(this.pollMs);
      const row = await this.read(key);
      if (!row) return null;
      if (row.state === 'done') return toResponse(row);
      if (row.locked_until && row.locked_until <= this.now()) return null;
    }
  }
}
