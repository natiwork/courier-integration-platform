import { describe, expect, it } from 'vitest';
import { backoffDelay, DEFAULT_RETRY_POLICY, retryWithBackoff } from '../../src/lib/retry.js';

type Result = { kind: 'success' | 'transient' | 'permanent' };
const transient: Result = { kind: 'transient' };

function scripted(...results: Result[]) {
  let calls = 0;
  return { attempt: async () => results[Math.min(calls++, results.length - 1)]!, calls: () => calls };
}

function recorder() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

const retryTransient = (r: Result) => r.kind === 'transient';

describe('backoffDelay', () => {
  it.each([
    [1, 100, 200],
    [2, 200, 400],
    [3, 400, 800],
    [6, 1000, 2000], // 200 × 2⁵ = 6400 is capped at 2000
  ])('waits between half and all of the cap after attempt %i (%i–%i ms)', (attempt, min, max) => {
    expect(backoffDelay(attempt, DEFAULT_RETRY_POLICY, () => 0)).toBe(min);
    expect(backoffDelay(attempt, DEFAULT_RETRY_POLICY, () => 0.999999)).toBe(max);
  });
});

describe('retryWithBackoff', () => {
  it('2 temporary failures, then success: succeeds on attempt 3 after two growing waits', async () => {
    const run = scripted(transient, transient, { kind: 'success' });
    const { waits, sleep } = recorder();

    const outcome = await retryWithBackoff(run.attempt, { policy: DEFAULT_RETRY_POLICY, shouldRetry: retryTransient, random: () => 0.5, sleep });

    expect(outcome).toEqual({ result: { kind: 'success' }, attempts: 3 });
    expect(waits).toEqual([150, 300]);
  });

  it('3 temporary failures: gives up after the third attempt, without a pointless last wait', async () => {
    const run = scripted(transient);
    const { waits, sleep } = recorder();

    const outcome = await retryWithBackoff(run.attempt, { policy: DEFAULT_RETRY_POLICY, shouldRetry: retryTransient, sleep });

    expect(outcome).toEqual({ result: transient, attempts: 3 });
    expect(run.calls()).toBe(3);
    expect(waits).toHaveLength(2);
  });

  it('a permanent failure is never retried', async () => {
    const run = scripted({ kind: 'permanent' });
    const { waits, sleep } = recorder();

    const outcome = await retryWithBackoff(run.attempt, { policy: DEFAULT_RETRY_POLICY, shouldRetry: retryTransient, sleep });

    expect(outcome.attempts).toBe(1);
    expect(waits).toEqual([]);
  });

  it('reports each failed attempt before waiting', async () => {
    const run = scripted(transient, { kind: 'success' });
    const seen: [number, number][] = [];
    await retryWithBackoff(run.attempt, {
      policy: DEFAULT_RETRY_POLICY,
      shouldRetry: retryTransient,
      random: () => 0,
      sleep: async () => {},
      onRetry: (attempt, _result, delayMs) => seen.push([attempt, delayMs]),
    });
    expect(seen).toEqual([[1, 100]]);
  });
});
