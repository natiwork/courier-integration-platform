// A thin wrapper around fetch for our API: unwraps { data } and turns { error } into an ApiError.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

const UNREACHABLE = "The server didn't respond. Check that the backend is running, then try again.";

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', UNREACHABLE);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = (body as ErrorBody | null)?.error;
    if (!apiError?.code) {
      // No JSON error from our API: usually the dev proxy couldn't reach the backend.
      throw new ApiError(response.status, 'HTTP_ERROR', UNREACHABLE);
    }
    throw new ApiError(response.status, apiError.code, apiError.message ?? 'Request failed', apiError.requestId);
  }

  return (body as { data: T }).data;
}
