import { ApiError } from '../api/client';

// Idempotency keys for user actions (submitting the order form, confirming a shipment).
// - A new action gets a new key, so creating two identical orders on purpose still works.
// - Trying the same action again after the request got no answer (network error) reuses the key:
//   if the server did receive the first request, it replays that answer instead of doing the work twice.
export interface ActionKeys {
  keyFor(payload: unknown): string;
  settle(error?: unknown): void; // call when the request ended, with its error if it failed
}

function serverMayNotHaveAnswered(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'HTTP_ERROR');
}

export function createActionKeys(generate: () => string = () => crypto.randomUUID()): ActionKeys {
  let pending: { key: string; payload: string } | null = null;
  return {
    keyFor(payload) {
      const json = JSON.stringify(payload);
      if (pending?.payload !== json) pending = { key: generate(), payload: json };
      return pending.key;
    },
    settle(error) {
      // Keep the key only while the outcome is unknown; an answer (success or a real error) ends the action.
      if (!serverMayNotHaveAnswered(error)) pending = null;
    },
  };
}
