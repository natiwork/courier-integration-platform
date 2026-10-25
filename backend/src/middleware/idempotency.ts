import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { AppError } from '../errors/appError.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/idempotencyStore.js';
import { stableStringify } from '../lib/stableStringify.js';

// Printable ASCII without spaces, like a UUID. Long enough for any reasonable key, short enough to store.
const KEY_FORMAT = /^[\x21-\x7E]{1,255}$/;

// Makes a POST safe to retry. The client sends an Idempotency-Key header (one per user action):
//   same key + same request  → the stored response is sent again (same status and body), nothing runs twice;
//   same key + other request → 422 IDEMPOTENCY_KEY_REUSED;
//   first request still busy → the retry waits for it and gets its response;
//   no header                → handled as before (no protection, but nothing breaks).
// Registered before validation, so even a 400 is replayed exactly.
export function idempotency(store: IdempotencyStore): RequestHandler {
  return async (req, res, next) => {
    const key = req.get('Idempotency-Key');
    if (key === undefined) {
      next();
      return;
    }
    if (!KEY_FORMAT.test(key)) {
      next(new AppError('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 1–255 visible ASCII characters', 400));
      return;
    }

    // The same key may only ever mean the same request: method, path and body.
    const fingerprint = createHash('sha256')
      .update(`${req.method} ${req.baseUrl}${req.path}\n${stableStringify(req.body ?? null)}`)
      .digest('hex');

    for (;;) {
      const begin = await store.begin(key, fingerprint);
      switch (begin.kind) {
        case 'mismatch':
          next(
            new AppError(
              'IDEMPOTENCY_KEY_REUSED',
              'This Idempotency-Key was already used for a different request. Use a new key for a new action.',
              422,
            ),
          );
          return;
        case 'replay':
          replay(res, begin.response);
          return;
        case 'wait': {
          const response = await begin.done;
          if (response) {
            replay(res, response);
            return;
          }
          continue; // the first request failed unexpectedly and stored nothing: try to claim the key again
        }
        case 'new':
          capture(res, begin.complete);
          next();
          return;
      }
    }
  };
}

function replay(res: Response, response: StoredResponse): void {
  res.setHeader('Idempotent-Replayed', 'true');
  if (response.location) res.location(response.location);
  res.status(response.status).json(response.body);
}

// Keeps a copy of what the route answers. 5xx other than courier errors (502/504) are not stored:
// those are our own failures, and a retry with the same key should get a real second chance.
function capture(res: Response, complete: (response: StoredResponse | null) => void): void {
  let captured: StoredResponse | null = null;
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    const location = res.getHeader('Location');
    captured = { status: res.statusCode, body, ...(typeof location === 'string' && { location }) };
    return json(body);
  };
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    const keep = captured !== null && (captured.status < 500 || captured.status === 502 || captured.status === 504);
    complete(keep ? captured : null);
  };
  res.on('finish', settle);
  res.on('close', settle); // the client went away before the answer was sent
}
