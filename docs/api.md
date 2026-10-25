# API reference

Everything the backend offers over HTTP, with the rules behind it. The overview is in the [README](../README.md).

## Backend features (Node.js 24, TypeScript, Express 5)

- Orders REST API:
  - `GET /api/orders?search=&status=&limit=` lists orders, newest first. `search` matches the order number, customer name or city (case-insensitive), `status` filters by one status, and `limit` is 1–100.
  - `GET /api/orders/:id` returns one order.
  - `POST /api/orders` creates an order and responds with `201` and a `Location` header.
  - `GET /api/orders/:id/events` returns the order's history, oldest first.
  - `POST /api/orders/:id/ship` with `{ "providerId", "service" }` hands the order to a courier (see [Shipping](#shipping)).
  - `GET /api/orders/:id/tracking` asks the courier for its current status. This is read-only and never changes the order.
  - `POST /api/orders/:id/mark-paid` records the payment of an unpaid order (`UNPAID → PAID`, with a `PAYMENT_RECORDED` event). Only paid orders can be shipped.
- **Order history:** every status change writes an `OrderEvent` (type, from, to, source, message, courier code, time) in the service layer, whichever way the change arrives. See [docs/state-machine.md](state-machine.md#order-events).
- Orders have line items, a total that the server computes (integer cents, currency EUR), a payment status (`PAID`, `UNPAID`, `REFUNDED`) and a destination country (ISO code, European countries).
- `GET /api/stats/overview` returns the dashboard numbers, computed from the orders (see [definitions](#dashboard-numbers)).
- `GET /api/meta/order-form` returns the supported countries, payment statuses and every validation limit, so the order form never hard-codes them.
- Courier provider layer (see [docs/courier-providers.md](courier-providers.md)):
  - a common `CourierProvider` interface;
  - results as a `success | transient | permanent` union instead of exceptions;
  - per-provider status normalization;
  - a registry.
  - Two **fictional mock couriers**: `SwiftParcel` (fast, reliable, up to 100 kg) and `NordCargo` (slower, sometimes temporarily unavailable, up to 30 kg, 11 countries, validates addresses). Their delays and outages are simulated with a seeded generator. No real courier is called.
- `GET /api/couriers` lists each courier with its capabilities and a health check. For the mocks the check is a **simulated ping**, labelled `"simulated": true`.
- `GET /api/integrations/activity` returns the courier calls this server made (accepted, rejected, unavailable) and a summary per courier.
- Input validation with Zod: trimmed strings, length limits, email format, parcel weight up to 100 kg, validated items, unknown fields rejected. Clients cannot send totals or system fields.
- An order status state machine with a single transition table, including `RETURNED` and `CANCELLED`; see [docs/state-machine.md](state-machine.md). Statuses change through shipping, courier webhooks and the recovery job; there are no manual cancel or deliver endpoints.
- A unified error format with a request id, also sent in the `X-Request-Id` header:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "path": "customerEmail", "message": "Customer email must be a valid email address" }], "requestId": "…" } }
  ```

  Internal error details and stack traces are logged and never returned to the client.
- **Courier webhooks** (see [docs/webhooks.md](webhooks.md)): `POST /api/webhooks/:providerId`.
  - Each courier has its own payload and header format.
  - Real HMAC-SHA256 signature checks over the raw body, with `timingSafeEqual` and a 5-minute replay window.
  - Deduplication by event id.
  - Updates go through the state machine and are recorded as order events. A forbidden transition is answered 200 and recorded as a warning.
  - **The webhooks are sent by our simulator** (`npm run simulate:webhook`, or "Simulate a courier update" in development); the checks are real.
- **Reliability** (see [docs/reliability.md](reliability.md)):
  - a timeout on every courier call (`PROVIDER_TIMEOUT_MS`, 2 s);
  - up to 3 attempts with exponential backoff and jitter for temporary courier failures;
  - `Idempotency-Key` on order creation and shipping;
  - structured JSON logs with the request id on every line and every courier attempt logged, with no personal data.
- **PostgreSQL storage** (see [Storage](storage.md#storage)):
  - plain SQL with the `pg` driver;
  - versioned migrations (`npm run db:migrate`);
  - every status change and its event written in one transaction with a conditional `UPDATE`, so two requests or two server processes can't both change the same order;
  - Idempotency-Keys, webhook deduplication and the webhook log in tables, so they survive restarts and work across processes;
  - a recovery job for ship requests interrupted by a crash.
- Environment variables are validated at startup; see `backend/.env.example`.
- End-to-end tests (Playwright, Chromium) that start the backend and the frontend and drive the main user flows; see [Tests in the README](../README.md#tests).
- Unit and API tests (Vitest + Supertest) on in-memory storage. Integration tests against a separate PostgreSQL test database, including the same repository contract tests and concurrency tests with two app instances.

## Shipping

`POST /api/orders/:id/ship` with `{ "providerId": "nordcargo", "service": "standard" }`:

1. The order must be `PENDING`, `PROCESSING` (being prepared) or `FAILED` (a retry), have no tracking number, and be **paid**.
2. The courier's published limits (country, weight) are checked first. If the parcel doesn't fit, the courier is never called.
3. The request takes the order's **shipping lock** (`shippingStartedAt`, set only if it is empty), and the order moves to `PROCESSING` if it isn't there yet. Then the courier is called. The lock is in the database, so it also stops a second server process.
4. Accepted: `SHIPPED`, with the courier's tracking number and provider id. Refused or unavailable: `FAILED`, with the courier's code and message in the history.

| Status | Code | When |
|---|---|---|
| 200 | — | Shipped. The body is the updated order. |
| 400 | `VALIDATION_ERROR` | Unknown courier or a service it doesn't offer. |
| 404 | `ORDER_NOT_FOUND` | No such order. |
| 409 | `ALREADY_SHIPPED` | The order has a tracking number. Nothing is sent again. |
| 409 | `INVALID_STATUS_TRANSITION` | The status can't move to `PROCESSING` (e.g. delivered, cancelled). |
| 409 | `ORDER_NOT_PAID` | The order is unpaid or refunded. Record the payment first (`mark-paid`). |
| 409 | `SHIPMENT_IN_PROGRESS` | Another ship request for this order is still waiting for the courier (the order has `shippingStartedAt`). |
| 409 | `SHIPMENT_INTERRUPTED` | The recovery job closed this attempt before the courier's answer arrived (only after more than 5 minutes). |
| 422 | `COURIER_CANNOT_TAKE_ORDER` | Outside the courier's countries or weight limit. Checked before calling it; the order is unchanged. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | The `Idempotency-Key` was already used for a different request. |
| 422 | `PROVIDER_REJECTED` | The courier refused (e.g. NordCargo without a house number). The order is now `FAILED`. |
| 502 | `PROVIDER_UNAVAILABLE` | The courier was still unavailable after 3 attempts. The order is now `FAILED` and can be shipped again. |
| 504 | `PROVIDER_TIMEOUT` | The courier didn't answer within `PROVIDER_TIMEOUT_MS`. The order is now `FAILED`. Not retried automatically, because the courier may have created the shipment. |

Temporary failures are retried automatically, up to 3 attempts. A failed shipment can be shipped again by hand ("Try shipping again"). Send an `Idempotency-Key` to make a request safe to repeat. See [docs/reliability.md](reliability.md).

`GET /api/orders/:id/tracking` answers `409 NOT_SHIPPED`, `409 DEMO_SHIPMENT` (generated tracking numbers), `422 PROVIDER_REJECTED` with `SHIPMENT_NOT_FOUND` (the mock couriers forget their shipments when the server restarts), or `502`. Its answer is shown, not applied: status updates from couriers will arrive by webhook and be recorded as events.

## Dashboard numbers

All day and month boundaries are in **UTC**.

| Number | Definition |
|---|---|
| Revenue | Sum of the totals of `PAID` orders, by the date they were created. Unpaid and refunded orders don't count. |
| Average order value | Revenue divided by the number of paid orders in the same period. |
| Trends | The last 30 days compared with the 30 days before. Shown as "no data" when the previous period is empty. |
| Return rate | Returned ÷ (delivered + returned), over all orders. |
| Delivery performance | Delivered ÷ (delivered + failed + returned), over all orders. |
| Needs attention | Failed deliveries, returns whose refund is still pending, and orders unpaid for more than 3 days (cancelled orders excluded). |
| Updated today | Status changes recorded today in the order history, by the new status. An order that moved twice today counts in both rows. New orders are counted separately as "created today". |
