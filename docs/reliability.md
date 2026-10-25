# Reliability of courier calls

Couriers are external services: they can be slow, briefly down, or answer after we have stopped waiting. These safeguards keep an order consistent anyway. Each one is covered by its own tests (file names in brackets).

## Timeout

Every courier call has a deadline: `PROVIDER_TIMEOUT_MS`, 2000 ms by default ([`withTimeout.test.ts`](../backend/tests/lib/withTimeout.test.ts), [`timeout.test.ts`](../backend/tests/api/timeout.test.ts)).

- `lib/withTimeout.ts` races the call against a timer and **aborts** it through an `AbortController`. `Promise.race` alone would only stop waiting, and the slow call would keep running. With the signal, a real HTTP integration passes it to `fetch()`, and the mocks stop their simulated delay.
- NordCargo usually answers in 0.4–1.2 s. About 5% of its answers take 2.5–4 s and time out.
- A timeout while shipping gives `FAILED`, a `PROVIDER_TIMEOUT` event and `504 PROVIDER_TIMEOUT`. A tracking lookup that times out also answers 504 and changes nothing.
- **A timeout is not retried automatically.** Without an answer, we don't know whether the courier created the shipment, and a retry could create a second one. The user decides, and the UI tells them to check with the courier first. The proper fix is an idempotency key sent *to the courier* with each create request, so the courier itself can recognise a repeat. The mocks don't support that yet.

## Bounded retries

Only answers where the courier says "not now" (`transient`, e.g. `PROVIDER_UNAVAILABLE`) are retried ([`retry.test.ts`](../backend/tests/lib/retry.test.ts), [`retries.test.ts`](../backend/tests/api/retries.test.ts)):

- **at most 3 attempts**;
- **exponential backoff with jitter**: about 200 ms, then 400 ms, each multiplied by a random factor in [0.5, 1). The cap is 2 s.

What is never retried, and why:
- a rejection (`permanent`): the same answer would come back;
- a timeout or an unexpected error: the shipment may already exist.

Why not retry forever: a courier that is down would get more and more requests, the user's request would never finish, and the order's lock would never be released.

Each attempt is logged. The final event stores `attempts`, so the Integrations page can show "Accepted on attempt 3" or "Unavailable after 3 attempts". The retries are not status changes: the history shows `PROCESSING` once, then `SHIPPED` or `FAILED`.

**Interaction with the lock.** The order's shipping lock (`shippingStartedAt`, see [state-machine.md](state-machine.md#status-vs-shipping-lock)) is held for the whole request, including the waits between attempts. It lives in the order row, so it also works across several server processes:
- a second ship request *without* an idempotency key gets `409 SHIPMENT_IN_PROGRESS`;
- *with the same key*, it waits for the first one and receives its answer.

## Idempotency-Key

`POST /api/orders` and `POST /api/orders/:id/ship` accept an `Idempotency-Key` header ([`idempotency.test.ts`](../backend/tests/api/idempotency.test.ts)).

| Request | Answer |
|---|---|
| New key | Handled normally; the response is stored for 24 hours. |
| Same key, same method, path and body | The stored response again (same status, body and `Location`), with `Idempotent-Replayed: true`. Nothing runs twice. |
| Same key while the first request is still running | Waits for it, then gets the same response. |
| Same key, different request | `422 IDEMPOTENCY_KEY_REUSED`. |
| Malformed key (spaces, over 255 characters) | `400 INVALID_IDEMPOTENCY_KEY`. |
| No key | Works as before, without this protection. |

Details:
- Bodies are compared with their keys sorted, so the key order in JSON doesn't matter.
- An unexpected `500` is not stored, so a retry gets a real second chance. Courier outcomes (`502`, `504`) are stored: a new attempt is a new user action with a new key.
- The **domain guard** stays as a second line of defence: an order with a tracking number answers `409 ALREADY_SHIPPED` whatever the key.

The frontend creates one key (`crypto.randomUUID()`) per user action: submitting the order form, confirming a shipment. It reuses the key only when the same action is sent again after a network error, because then the server may have done the work without the answer arriving (`lib/actionKey.ts`). Any real answer, success or error, ends the action.

With `STORAGE=postgres` the keys live in the `idempotency_keys` table, with the same rules ([`idempotencyStore.contract.ts`](../backend/tests/contracts/idempotencyStore.contract.ts) runs against both stores):
- **Claim:** `INSERT … ON CONFLICT (key) DO NOTHING`. The primary key decides which of two requests owns a key, even in two server processes.
- **Wait:** a request in another process can't wake the waiting one, so it reads the row again every 100 ms until the answer is stored.
- **Lease:** a key in flight carries `locked_until` (5 minutes, longer than the slowest real request). If its process died, a retry takes the key over after that instead of waiting forever.
- **Cleanup:** keys older than 24 hours and expired leases are deleted every minute. Webhook event ids work the same way (`webhook_events`, primary key `(provider_id, event_id)`, 7 days, 1-minute lease).

## Structured logs

`lib/logger.ts` is a small custom logger, with no dependency. We only need JSON lines with levels and fields, not transports or rotation.

- One JSON object per line on stdout. The level comes from `LOG_LEVEL`: `info` by default, silent under `NODE_ENV=test`.
- The `requestId` that every response already carries (`X-Request-Id`, and `requestId` in error bodies) is put into an `AsyncLocalStorage` for the whole request. Every log line written while handling the request includes it.
- `request finished`: method, path (**without the query string**: `?search=` can contain a customer's name), status, `durationMs`.
- `courier call`, once per attempt: `provider`, `operation`, `orderId`, `attempt`, `durationMs`, `outcome`, `code`.
- Unexpected errors: `request failed`, with the stack. Stack traces never appear in responses.
- **No personal data:** only ids, codes and timings. A test runs a whole create, search and ship flow and checks that no name, email, address or postal code appears in the logs ([`logging.test.ts`](../backend/tests/api/logging.test.ts)).

To trace a request, take the `requestId` from the response or the error message and filter the log by it:

```bash
grep '"requestId":"<id>"' backend.log
```

## A crash while waiting for the courier

The order takes its shipping lock before the courier is called. With the timeout, the call can't hang forever: it ends in `SHIPPED` or `FAILED` within about `3 × timeout + backoff`.

If the **process dies** in between (deploy, crash, power loss), the lock stays in the database and nobody finishes the job. Whether the courier created the shipment is unknown.

**What we do: a recovery job** ([`recoveryService.ts`](../backend/src/services/recoveryService.ts)). At startup and every minute it finds orders whose `shipping_started_at` is older than **5 minutes** (longer than any real request: 3 × the maximum 60 s timeout plus backoff) and closes them: `PROCESSING → FAILED`, lock cleared, with a `STATUS_CHANGED` event from `system`, code `SHIPMENT_INTERRUPTED`: "Recovered after interruption: the request to SwiftParcel never finished, so no courier answer was recorded. Check with the courier before trying again."
- It looks only at the lock, never at the status alone: `PROCESSING` also means "being prepared", and those orders are left alone.
- The update is conditional on the same `shipping_started_at`, so if the request finishes at that very moment, exactly one of them wins. A late courier answer after recovery doesn't overwrite the history (`409 SHIPMENT_INTERRUPTED`).
- Several server processes can run it at the same time.

This is the smallest honest answer: the order says what happened and asks a person to check. It doesn't find out whether the parcel exists.

**The bigger alternative: a transactional outbox.** The lock and a "ship this order" task are written in one transaction. A worker picks up unfinished tasks, including after a restart, asks the courier whether a shipment for this order already exists (or sends the same provider idempotency key again), and completes the job automatically. It needs a task table, a worker loop and couriers that support idempotency keys or lookups by our order id. Our mock couriers don't, so this was left out.
