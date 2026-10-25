import { describe, expect, it } from 'vitest';
import type { BeginResult, IdempotencyStore } from '../../src/idempotency/idempotencyStore.js';

function expectNew(result: BeginResult): Extract<BeginResult, { kind: 'new' }> {
  if (result.kind !== 'new') throw new Error(`expected new, got ${result.kind}`);
  return result;
}

const created = { status: 201, body: { data: { id: 'a', items: [1, 2] } }, location: '/api/orders/a' };

// What every IdempotencyStore must do. `fresh(now, ttlMs)` returns an empty store using that clock and TTL.
export function idempotencyStoreContract(name: string, fresh: (now: () => Date, ttlMs?: number) => Promise<IdempotencyStore>): void {
  describe(`${name} (IdempotencyStore contract)`, () => {
    const clock = () => new Date('2026-10-24T00:00:00.000Z');

    it('replays the stored response for the same key and request', async () => {
      const store = await fresh(clock);
      await expectNew(await store.begin('key-1', 'fp')).complete(created);
      expect(await store.begin('key-1', 'fp')).toEqual({ kind: 'replay', response: created });
    });

    it('refuses the same key for a different request', async () => {
      const store = await fresh(clock);
      await expectNew(await store.begin('key-1', 'fp')).complete(created);
      expect(await store.begin('key-1', 'other')).toEqual({ kind: 'mismatch' });
    });

    it('lets a retry wait for a request still running and get its response', async () => {
      const store = await fresh(clock);
      const first = expectNew(await store.begin('key-1', 'fp'));
      const second = await store.begin('key-1', 'fp');
      if (second.kind !== 'wait') throw new Error(`expected wait, got ${second.kind}`);
      await first.complete(created);
      expect(await second.done).toEqual(created);
    });

    it('forgets a key that stored nothing (our own 500), so the retry does the work', async () => {
      const store = await fresh(clock);
      const first = expectNew(await store.begin('key-1', 'fp'));
      const second = await store.begin('key-1', 'fp');
      if (second.kind !== 'wait') throw new Error(`expected wait, got ${second.kind}`);
      await first.complete(null);
      expect(await second.done).toBeNull();
      expect((await store.begin('key-1', 'fp')).kind).toBe('new');
    });

    it('gives a key to exactly one of many simultaneous requests', async () => {
      const store = await fresh(clock);
      const results = await Promise.all(Array.from({ length: 5 }, () => store.begin('key-1', 'fp')));
      expect(results.map((result) => result.kind).sort()).toEqual(['new', 'wait', 'wait', 'wait', 'wait']);

      const owner = results.find((result): result is Extract<BeginResult, { kind: 'new' }> => result.kind === 'new')!;
      await owner.complete(created);
      const waits = results.filter((result): result is Extract<BeginResult, { kind: 'wait' }> => result.kind === 'wait');
      expect(await Promise.all(waits.map((result) => result.done))).toEqual([created, created, created, created]);
    });

    it('forgets answers after the TTL', async () => {
      let now = new Date('2026-10-24T00:00:00.000Z');
      const store = await fresh(() => now, 1000);
      await expectNew(await store.begin('key-1', 'fp')).complete(created);
      now = new Date(now.getTime() + 1000);
      expect((await store.begin('key-1', 'other')).kind).toBe('new');
    });
  });
}
