import { describe, expect, it } from 'vitest';
import { InMemoryWebhookEventStore } from '../../src/webhooks/webhookEventStore.js';

describe('InMemoryWebhookEventStore', () => {
  it('a kept event is a duplicate from then on', async () => {
    const store = new InMemoryWebhookEventStore();
    const first = await store.claim('swiftparcel:evt_1');
    if (first.kind !== 'new') throw new Error('expected new');
    first.keep();
    expect((await store.claim('swiftparcel:evt_1')).kind).toBe('duplicate');
  });

  it('a released event can be claimed again (the courier retry gets handled)', async () => {
    const store = new InMemoryWebhookEventStore();
    const first = await store.claim('swiftparcel:evt_1');
    if (first.kind !== 'new') throw new Error('expected new');
    first.release();
    expect((await store.claim('swiftparcel:evt_1')).kind).toBe('new');
  });

  it('a parallel copy waits for the first: duplicate if kept, its own turn if released', async () => {
    const store = new InMemoryWebhookEventStore();
    const first = await store.claim('k');
    if (first.kind !== 'new') throw new Error('expected new');
    const waiting = store.claim('k');
    first.release();
    const second = await waiting;
    expect(second.kind).toBe('new');
    if (second.kind !== 'new') return;
    const third = store.claim('k');
    second.keep();
    expect((await third).kind).toBe('duplicate');
  });

  it('forgets events after the TTL, and keys are per courier', async () => {
    let now = new Date('2026-10-24T00:00:00.000Z');
    const store = new InMemoryWebhookEventStore(() => now, 1000);
    const claim = await store.claim('swiftparcel:evt_1');
    if (claim.kind === 'new') claim.keep();
    expect((await store.claim('nordcargo:evt_1')).kind).toBe('new');
    now = new Date(now.getTime() + 1000);
    expect((await store.claim('swiftparcel:evt_1')).kind).toBe('new');
  });
});
