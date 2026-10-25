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

**Interaction with the lock.** `ShipmentService` keeps a per-order in-flight lock for the whole request, including the waits between attempts:
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

Keys live in memory. With PostgreSQL (Phase 9) they move to a table with a unique key column, and `INSERT … ON CONFLICT` claims a key atomically, like `begin()` does now.

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

## Known limitation: a crash during `PROCESSING`

The order moves to `PROCESSING` before the courier is called. With the timeout, the call can no longer hang forever: it always ends in `SHIPPED` or `FAILED` within about `3 × timeout + backoff`.

One case remains. If the **process dies** between `PROCESSING` and the courier's answer (deploy, crash, power loss), the order stays in `PROCESSING`, and no code is left to finish the job. Whether the courier created the shipment is unknown.

Phase 9 (PostgreSQL) can solve this in one of two ways:
- **Transactional outbox:** the status change and a "ship this order" task are written in one transaction. A worker picks up unfinished tasks, including after a restart, and completes them. A provider idempotency key makes the repeat safe.
- **Recovery job:** a periodic job finds orders in `PROCESSING` older than a few minutes, asks the courier whether a shipment exists for them, and records `SHIPPED` or `FAILED` with an event.

Until then, an order stuck this way needs manual attention. The in-memory data is lost on restart anyway.
