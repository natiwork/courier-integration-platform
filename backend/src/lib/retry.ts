import { sleep as realSleep } from './sleep.js';

export interface RetryPolicy {
  maxAttempts: number; // including the first one
  baseDelayMs: number; // wait after the first failure
  maxDelayMs: number; // the exponential growth stops here
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 2000 };

// Exponential backoff with jitter: about 200 ms, then 400 ms, 800 ms… up to the cap, each multiplied by a random
// factor in [0.5, 1). Waiting longer each time gives a struggling courier room to recover; the jitter keeps many
// clients that failed at the same moment from all retrying at the same moment again.
export function backoffDelay(failedAttempt: number, policy: RetryPolicy, random: () => number): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.round(cap * (0.5 + random() * 0.5));
}

export interface RetryOptions<T> {
  policy: RetryPolicy;
  shouldRetry: (result: T) => boolean;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  // Called before each wait, e.g. to log the attempt that failed.
  onRetry?: (failedAttempt: number, result: T, delayMs: number) => void;
}

// Runs `attempt` until it gives a result that shouldn't be retried, or the attempts run out. Never unbounded:
// endless retries would hammer a courier that is already down and keep the request (and its lock) open forever.
export async function retryWithBackoff<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  { policy, shouldRetry, random = Math.random, sleep = realSleep, onRetry }: RetryOptions<T>,
): Promise<{ result: T; attempts: number }> {
  for (let attemptNumber = 1; ; attemptNumber++) {
    const result = await attempt(attemptNumber);
    if (!shouldRetry(result) || attemptNumber >= policy.maxAttempts) return { result, attempts: attemptNumber };
    const delayMs = backoffDelay(attemptNumber, policy, random);
    onRetry?.(attemptNumber, result, delayMs);
    await sleep(delayMs);
  }
}
