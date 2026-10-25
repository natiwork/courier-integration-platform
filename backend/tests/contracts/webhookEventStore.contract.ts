import { describe, expect, it } from 'vitest';
import type { Claim, WebhookEventStore } from '../../src/webhooks/webhookEventStore.js';

function expectNew(claim: Claim): Extract<Claim, { kind: 'new' }> {
  if (claim.kind !== 'new') throw new Error('expected a new claim');
  return claim;
}

// What every WebhookEventStore must do. `fresh(now, ttlMs)` returns an empty store using that clock and TTL.
export function webhookEventStoreContract(name: string, fresh: (now: () => Date, ttlMs?: number) => Promise<WebhookEventStore>): void {
  describe(`${name} (WebhookEventStore contract)`, () => {
    const clock = () => new Date('2026-10-24T00:00:00.000Z');

    it('a kept event is a duplicate from then on', async () => {
      const store = await fresh(clock);
      await expectNew(await store.claim('swiftparcel', 'evt_1')).keep();
      expect((await store.claim('swiftparcel', 'evt_1')).kind).toBe('duplicate');
    });

    it('a released event can be claimed again (the courier retry gets handled)', async () => {
      const store = await fresh(clock);
      await expectNew(await store.claim('swiftparcel', 'evt_1')).release();
      expect((await store.claim('swiftparcel', 'evt_1')).kind).toBe('new');
    });

    it('a parallel copy waits for the first: duplicate if kept, its own turn if released', async () => {
      const store = await fresh(clock);
      const first = expectNew(await store.claim('swiftparcel', 'k'));
      const waiting = store.claim('swiftparcel', 'k');
      await first.release();
      const second = expectNew(await waiting);
      const third = store.claim('swiftparcel', 'k');
      await second.keep();
      expect((await third).kind).toBe('duplicate');
    });

    it('lets exactly one of many simultaneous copies through', async () => {
      const store = await fresh(clock);
      const claims = await Promise.all(Array.from({ length: 5 }, () => store.claim('nordcargo', 'evt_9').then(async (claim) => {
        if (claim.kind === 'new') await claim.keep();
        return claim.kind;
      })));
      expect(claims.sort()).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate', 'new']);
    });

    it('forgets events after the TTL, and event ids are per courier', async () => {
      let now = new Date('2026-10-24T00:00:00.000Z');
      const store = await fresh(() => now, 1000);
      await expectNew(await store.claim('swiftparcel', 'evt_1')).keep();
      expect((await store.claim('nordcargo', 'evt_1')).kind).toBe('new');
      now = new Date(now.getTime() + 1000);
      expect((await store.claim('swiftparcel', 'evt_1')).kind).toBe('new');
    });
  });
}
