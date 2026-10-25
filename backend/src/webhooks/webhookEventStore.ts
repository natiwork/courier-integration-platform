// Remembers which courier events were already handled, so a redelivered event changes nothing.
// Couriers deliver "at least once": after a timeout or an error on our side they send the same event again.
// In memory for now; a table with a unique (provider, event id) key in Phase 9.

export type Claim =
  | { kind: 'new'; keep: () => void; release: () => void } // handle it, then keep() or release()
  | { kind: 'duplicate' };

interface Entry {
  claimedAt: number;
  settled?: Promise<boolean>; // resolves to true when kept, false when released
}

export const WEBHOOK_DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // longer than any courier keeps retrying

export class InMemoryWebhookEventStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = WEBHOOK_DEDUPE_TTL_MS,
  ) {}

  async claim(key: string): Promise<Claim> {
    for (;;) {
      const nowMs = this.now().getTime();
      for (const [k, entry] of this.entries) {
        if (!entry.settled && nowMs - entry.claimedAt >= this.ttlMs) this.entries.delete(k);
      }

      const existing = this.entries.get(key);
      if (existing?.settled) {
        // The same event is being handled right now: wait. If that attempt ends up released (the courier is
        // expected to retry), this one may handle it instead of being dropped as a duplicate.
        if (await existing.settled) return { kind: 'duplicate' };
        continue;
      }
      if (existing) return { kind: 'duplicate' };

      let settle!: (kept: boolean) => void;
      const entry: Entry = { claimedAt: nowMs, settled: new Promise((resolve) => (settle = resolve)) };
      this.entries.set(key, entry);
      return {
        kind: 'new',
        // A final outcome (applied, ignored, unchanged): later copies of this event are duplicates.
        keep: () => {
          delete entry.settled;
          settle(true);
        },
        // An outcome the courier should retry (unknown tracking number, our own error): forget the event,
        // otherwise the retry would be answered "duplicate" and the update lost.
        release: () => {
          this.entries.delete(key);
          settle(false);
        },
      };
    }
  }
}
