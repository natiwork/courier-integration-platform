import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export interface ApiState<T> {
  status: 'loading' | 'success' | 'error';
  // Kept while a new request is loading, so lists don't flash empty on every keystroke.
  data: T | undefined;
  error: Error | undefined;
  reload: () => void;
}

interface Result<T> {
  key: string; // which request this result belongs to
  status: 'success' | 'error';
  data: T | undefined;
  error: Error | undefined;
}

// Loads data whenever `key` changes (e.g. JSON of the query) or reload() is called,
// cancels the previous request, and exposes loading / success / error.
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, key: string): ApiState<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const requestKey = `${key}#${attempt}`;

  // An effect event always sees the latest `load`, without making it an effect dependency.
  const runLoad = useEffectEvent((signal: AbortSignal) => load(signal));

  useEffect(() => {
    const controller = new AbortController();
    runLoad(controller.signal).then(
      (data) => setResult({ key: requestKey, status: 'success', data, error: undefined }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({
          key: requestKey,
          status: 'error',
          data: previous?.data,
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      },
    );
    return () => controller.abort();
  }, [requestKey]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  // "Loading" is derived, not stored: the latest result belongs to an older request.
  const isCurrent = result?.key === requestKey;
  return {
    status: isCurrent ? result.status : 'loading',
    data: result?.data,
    error: isCurrent ? result.error : undefined,
    reload,
  };
}
