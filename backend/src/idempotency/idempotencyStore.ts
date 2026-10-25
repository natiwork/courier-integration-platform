// Remembers what was answered to a request with a given Idempotency-Key, so a retry gets the same answer
// instead of doing the work twice. In memory for now; PostgreSQL in Phase 9 (INSERT ... ON CONFLICT does what
// begin() does here: claim the key atomically).

export interface StoredResponse {
  status: number;
  body: unknown;
  location?: string; // the Location header of a 201
}

export type BeginResult =
  | { kind: 'new'; complete: (response: StoredResponse | null) => void } // first time: do the work, then complete()
  | { kind: 'replay'; response: StoredResponse } // done before with the same body
  | { kind: 'wait'; done: Promise<StoredResponse | null> } // the first request is still running
  | { kind: 'mismatch' }; // the key was used with a different request

export interface IdempotencyStore {
  begin(key: string, fingerprint: string): Promise<BeginResult>;
}

interface Entry {
  fingerprint: string;
  createdAt: number;
  response?: StoredResponse;
  done?: Promise<StoredResponse | null>;
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = IDEMPOTENCY_TTL_MS,
  ) {}

  // Everything up to the return happens synchronously, so two requests with the same key can never both
  // get "new" (JavaScript runs one piece of code at a time).
  async begin(key: string, fingerprint: string): Promise<BeginResult> {
    const nowMs = this.now().getTime();
    this.dropExpired(nowMs);

    const existing = this.entries.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { kind: 'mismatch' };
      if (existing.response) return { kind: 'replay', response: existing.response };
      if (existing.done) return { kind: 'wait', done: existing.done };
    }

    let finish!: (response: StoredResponse | null) => void;
    const entry: Entry = { fingerprint, createdAt: nowMs, done: new Promise((resolve) => (finish = resolve)) };
    this.entries.set(key, entry);
    return {
      kind: 'new',
      complete: (response) => {
        // Nothing worth keeping (an unexpected 500): forget the key, so the client's retry can do the work.
        if (response) {
          entry.response = response;
          delete entry.done;
        } else {
          this.entries.delete(key);
        }
        finish(response);
      },
    };
  }

  private dropExpired(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      // A request still running is never dropped, however long it takes.
      if (!entry.done && nowMs - entry.createdAt >= this.ttlMs) this.entries.delete(key);
    }
  }
}
