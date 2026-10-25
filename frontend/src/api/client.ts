// A thin wrapper around fetch for our API: unwraps { data } and turns { error } into an ApiError.

export interface ApiErrorDetail {
  path?: string; // validation errors: e.g. "customerEmail" or "items.0.quantity"
  message: string;
  // Courier errors (422/502 from shipping): which courier answered and its own error code.
  providerId?: string;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, requestId?: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; requestId?: string; details?: ApiErrorDetail[] };
}

const UNREACHABLE = "The server didn't respond. Check that the backend is running, then try again.";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', UNREACHABLE);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = (body as ErrorBody | null)?.error;
    if (!apiError?.code) {
      // No JSON error from our API: usually the dev proxy couldn't reach the backend.
      throw new ApiError(response.status, 'HTTP_ERROR', UNREACHABLE);
    }
    throw new ApiError(
      response.status,
      apiError.code,
      apiError.message ?? 'Request failed',
      apiError.requestId,
      Array.isArray(apiError.details) ? apiError.details : [],
    );
  }

  return (body as { data: T }).data;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal });
}

export function apiPost<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
