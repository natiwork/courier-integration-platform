import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../src/lib/withTimeout.js';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const after = (ms: number, value: string) => (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => resolve(value), ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });

  it('returns the value when the call finishes in time, and leaves no timer behind', async () => {
    const pending = withTimeout(after(1999, 'done'), 2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(await pending).toEqual({ timedOut: false, value: 'done' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up at the deadline and aborts the call, so it stops too', async () => {
    let seen: AbortSignal | undefined;
    const pending = withTimeout((signal) => {
      seen = signal;
      return after(5000, 'too late')(signal);
    }, 2000);

    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toEqual({ timedOut: true });
    expect(seen?.aborted).toBe(true);
    expect((seen?.reason as Error).name).toBe('TimeoutError');
    // The slow call's own timer was cancelled by the abort: nothing keeps running in the background.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes on an error that happens before the deadline', async () => {
    const pending = withTimeout(() => Promise.reject(new Error('boom')), 2000);
    await expect(pending).rejects.toThrow('boom');
  });
});
