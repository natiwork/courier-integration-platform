export type TimeoutResult<T> = { timedOut: false; value: T } | { timedOut: true };

// Runs `run` with a deadline. Promise.race alone would only stop *waiting*: the slow call would keep going in
// the background. The AbortController also tells the call to stop (fetch() and the mocks listen to the signal).
// If `run` fails before the deadline, the error is passed on unchanged.
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<TimeoutResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException(`Timed out after ${ms} ms`, 'TimeoutError'));
      resolve({ timedOut: true });
    }, ms);
  });
  const work = run(controller.signal).then((value): TimeoutResult<T> => ({ timedOut: false, value }));
  try {
    // A late rejection of `work` (the aborted call) is still handled by race, so it never becomes unhandled.
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
