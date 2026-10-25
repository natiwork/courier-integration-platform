# Courier Integration Platform

A full-stack platform for managing e-commerce orders and courier service integrations. The web app is called **LogiFlow**.

> **Work in progress.** Only the features listed below are implemented. Data is kept in PostgreSQL (`STORAGE=postgres`) or, without a database, in memory, where it is lost when the server restarts. See [Storage](#storage). In development the app runs on generated [demo data](#demo-data).

## Implemented

### Backend (Node.js 24, TypeScript, Express 5)

- Orders REST API:
  - `GET /api/orders?search=&status=&limit=` lists orders, newest first. `search` matches the order number, customer name or city (case-insensitive), `status` filters by one status, and `limit` is 1–100.
  - `GET /api/orders/:id` returns one order.
  - `POST /api/orders` creates an order and responds with `201` and a `Location` header.
  - `GET /api/orders/:id/events` returns the order's history, oldest first.
  - `POST /api/orders/:id/ship` with `{ "providerId", "service" }` hands the order to a courier (see [Shipping](#shipping)).
  - `GET /api/orders/:id/tracking` asks the courier for its current status. This is read-only and never changes the order.
  - `POST /api/orders/:id/mark-paid` records the payment of an unpaid order (`UNPAID → PAID`, with a `PAYMENT_RECORDED` event). Only paid orders can be shipped.
- **Order history:** every status change writes an `OrderEvent` (type, from, to, source, message, courier code, time) in the service layer, whichever way the change arrives. See [docs/state-machine.md](docs/state-machine.md#order-events).
- Orders have line items, a total that the server computes (integer cents, currency EUR), a payment status (`PAID`, `UNPAID`, `REFUNDED`) and a destination country (ISO code, European countries).
- `GET /api/stats/overview` returns the dashboard numbers, computed from the orders (see [definitions](#dashboard-numbers)).
- `GET /api/meta/order-form` returns the supported countries, payment statuses and every validation limit, so the order form never hard-codes them.
- Courier provider layer (see [docs/courier-providers.md](docs/courier-providers.md)):
  - a common `CourierProvider` interface;
  - results as a `success | transient | permanent` union instead of exceptions;
  - per-provider status normalization;
  - a registry.
  - Two **fictional mock couriers**: `SwiftParcel` (fast, reliable, up to 100 kg) and `NordCargo` (slower, sometimes temporarily unavailable, up to 30 kg, 11 countries, validates addresses). Their delays and outages are simulated with a seeded generator. No real courier is called.
- `GET /api/couriers` lists each courier with its capabilities and a health check. For the mocks the check is a **simulated ping**, labelled `"simulated": true`.
- `GET /api/integrations/activity` returns the courier calls this server made (accepted, rejected, unavailable) and a summary per courier.
- Input validation with Zod: trimmed strings, length limits, email format, parcel weight up to 100 kg, validated items, unknown fields rejected. Clients cannot send totals or system fields.
- An order status state machine with a single transition table, including `RETURNED` and `CANCELLED`; see [docs/state-machine.md](docs/state-machine.md). Shipping is the only HTTP action that changes a status so far.
- A unified error format with a request id, also sent in the `X-Request-Id` header:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "path": "customerEmail", "message": "Customer email must be a valid email address" }], "requestId": "…" } }
  ```

  Internal error details and stack traces are logged and never returned to the client.
- **Courier webhooks** (see [docs/webhooks.md](docs/webhooks.md)): `POST /api/webhooks/:providerId`.
  - Each courier has its own payload and header format.
  - Real HMAC-SHA256 signature checks over the raw body, with `timingSafeEqual` and a 5-minute replay window.
  - Deduplication by event id.
  - Updates go through the state machine and are recorded as order events. A forbidden transition is answered 200 and recorded as a warning.
  - **The webhooks are sent by our simulator** (`npm run simulate:webhook`, or "Simulate a courier update" in development); the checks are real.
- **Reliability** (see [docs/reliability.md](docs/reliability.md)):
  - a timeout on every courier call (`PROVIDER_TIMEOUT_MS`, 2 s);
  - up to 3 attempts with exponential backoff and jitter for temporary courier failures;
  - `Idempotency-Key` on order creation and shipping;
  - structured JSON logs with the request id on every line and every courier attempt logged, with no personal data.
- **PostgreSQL storage** (see [Storage](#storage)):
  - plain SQL with the `pg` driver;
  - versioned migrations (`npm run db:migrate`);
  - every status change and its event written in one transaction with a conditional `UPDATE`, so two requests or two server processes can't both change the same order;
  - Idempotency-Keys, webhook deduplication and the webhook log in tables, so they survive restarts and work across processes;
  - a recovery job for ship requests interrupted by a crash.
- Environment variables are validated at startup; see `backend/.env.example`.
- Unit and API tests (Vitest + Supertest) on in-memory storage. Integration tests against a separate PostgreSQL test database, including the same repository contract tests and concurrency tests with two app instances.

### Frontend: LogiFlow (React 19, TypeScript, Vite, React Router)

- A light and a dark theme with a toggle. The choice is remembered, and the system setting is used by default. The colours meet WCAG AA contrast.
- **Overview dashboard**, where every number comes from the API:
  - revenue for the last 30 days with its trend;
  - orders, average order value and return rate;
  - revenue or orders per month over 9 months;
  - status changes made today;
  - delivery performance;
  - orders that need attention, with links to each order;
  - recent orders, top destinations and top products.
- **Shipments**: an orders table with search and a status filter. Both are kept in the URL, so a filtered view can be shared or reloaded.
- **Shipment details**: items and total, customer and delivery data, a shipment timeline and a route diagram.
  - **Ship this order** (pending orders, and failed ones that no courier took yet):
    - choose a courier and a service;
    - couriers that can't take the parcel (country, weight) are disabled, with the reason shown;
    - a confirmation dialog (native `<dialog>`: focus stays inside, Escape closes, focus returns to the Ship button), then a success or error message for each error code.
  - **Courier and tracking**: the tracking number with a copy button, and "Ask the courier for the latest status" (read-only). Demo tracking numbers are labelled instead, because no courier has a record of them.
  - The timeline shows the real time of every step from the order history, and why a shipment failed. "Full history" lists every event, including failed attempts before a retry.
  - The route is a **schematic**. It is labelled as such: it is not a map and shows no live location.
- **New shipment**: a form to create an order.
  - Fields: customer, delivery address and country, parcel weight, payment status, and a list of items you can add to and remove from.
  - Line totals and an estimated order total update as you type. Money is handled in integer cents; the server still computes the real total.
  - Client-side checks use the same rules and messages as the API. Server validation errors appear next to the matching field, including item fields like `items.1.quantity`. Other errors show the request id.
  - Accessible: labelled fields, errors linked with `aria-describedby`, and an error summary that receives focus. The form can be used with the keyboard alone and works at 375 px.
  - Double submits are blocked, so a double click creates exactly one order.
  - After creating, you land on the new order with a confirmation, and the dashboard numbers refresh.
- Every widget and page has its own loading, empty and error state with retry. These were checked with the backend stopped.
- Responsive from 375 px to wide screens: the sidebar turns into an icon rail and then a menu, and tables turn into cards.
- Keyboard-accessible: a skip link, visible focus, focus moves to the new page heading after navigation, and the mobile menu closes with Escape.
- **Couriers**: a card for each provider from `GET /api/couriers`:
  - health check result, with a note that it is simulated;
  - max parcel weight compared with the platform limit;
  - services and address validation;
  - which of the platform's 31 countries it delivers to.
  - "Check again" runs the health checks again. Order tables and details show the courier's name from the same request.
- **Integrations**:
  - calls per courier (accepted, rejected, unavailable) and the time of the last call;
  - a table of recent calls with links to the orders;
  - incoming webhooks: applied, duplicate, ignored and refused, including rejected signatures.
  - Only real calls made by this server are listed. Demo orders were generated, so they never appear.

## Demo data

In development the backend fills its store with **~1,200 invented demo orders**, about 4–5 a day and growing over time, spread over the last 9 months, so the dashboard has something to show.

- Everything in them is made up: customers (with `@example.com` addresses), addresses, products, and tracking numbers prefixed with `DEMO-`.
- Shipped orders name one of the fictional mock couriers by its provider id (`swiftparcel`, `nordcargo`). Each order fits that courier's limits: NordCargo only gets parcels for its 11 countries. The orders were not created through the couriers: the tracking numbers are invented.
- Every demo order also gets a **history**, one event per step, from its creation to its current status. The steps follow the state machine, and the timestamps lie between `createdAt` and `updatedAt`. The events are marked as generated (`source: "system"`, "Demo data: …"), not as courier calls.
- The UI shows a **Demo data** label while this data is loaded.

How it works:
- It is on by default unless `NODE_ENV=production`.
- Turn it off with `SEED_DEMO_DATA=false npm run dev`, or set it in `backend/.env` (see `backend/.env.example`).
- The data is generated from a fixed seed, so it is the same on every start. Only the dates change, because they are relative to "now".
- With PostgreSQL the demo data is written **only into an empty database**, in one transaction, so a restart never duplicates it. `npm run db:seed` does the same on demand. To start over: `docker compose down -v`, `docker compose up -d db`, `npm run db:migrate`.

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

Temporary failures are retried automatically, up to 3 attempts. A failed shipment can be shipped again by hand ("Try shipping again"). Send an `Idempotency-Key` to make a request safe to repeat. See [docs/reliability.md](docs/reliability.md).

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

## Storage

`STORAGE` in `backend/.env` chooses where data is kept. The services don't know which one is used: both implement the same repository interfaces, and the same contract tests run against both.

| | `memory` (default) | `postgres` |
|---|---|---|
| Needs | nothing | Docker: `docker compose up -d db`, then `npm run db:migrate` |
| Data after a restart | gone | kept: orders, history, Idempotency-Keys, webhook dedupe and log |
| Several server processes | each has its own data | share one database; locks and checks work across them |
| Used by | `npm test`, a fresh clone without Docker | local development, `npm run test:integration` |

How the database is used:
- **Schema:** `backend/migrations/001_init.sql`, applied by `npm run db:migrate` (each file once, in a transaction, recorded in `schema_migrations`). The server refuses to start if a migration is pending.
- **Tables:** `orders`, `order_items`, `order_events`, `idempotency_keys`, `webhook_events`, `webhook_receipts`. `CHECK` constraints repeat the allowed statuses and types (a test keeps them equal to the code), `UNIQUE` on the tracking number and on `(provider_id, event_id)`, foreign keys from items, events and receipts to orders, and indexes for the list sort, the status filter, an order's history, recent events and the recovery job.
- **Atomic changes:** every status change is `UPDATE … WHERE id = $1 AND status = <what was read> RETURNING *` plus its event, in one transaction. If another request was faster, nothing is written; the order is read again and the request usually gets `409`.
- **Errors:** an unreachable database answers `503 DATABASE_UNAVAILABLE`; a unique violation answers `409 DUPLICATE_RECORD`. The driver's message is only logged.
- **Housekeeping:** at startup and every minute, ship requests whose lock is older than 5 minutes are closed as `FAILED` ("Recovered after interruption", the courier may or may not have the parcel), and expired Idempotency-Keys (24 h) and webhook event ids (7 days) are deleted. See [docs/reliability.md](docs/reliability.md).
- **Dashboard numbers** are still computed in TypeScript from all orders. Fine for thousands of rows; at millions they would move into SQL aggregations (`GROUP BY`, `date_trunc`, `FILTER`).

## Run it

```bash
nvm use            # Node 24 from .nvmrc

cd backend
npm install
npm run dev        # http://localhost:3000/health, seeds demo data, logs the mock courier seed
```

That runs on in-memory storage. With PostgreSQL (data survives restarts):

```bash
cp .env.example .env                 # in the project root: database user, password, port for Docker Compose
docker compose up -d db              # PostgreSQL 18 in Docker; check with: docker compose ps
cd backend
# in backend/.env: STORAGE=postgres, DATABASE_URL=postgres://<user>:<password>@localhost:5432/<db>
#                  and TEST_DATABASE_URL=... with a database name ending in _test (see backend/.env.example)
npm run db:migrate                   # create or update the tables
npm run dev                          # seeds the demo data into the empty database once
```

Then the frontend:

```bash
cd frontend       # in a second terminal
npm install
npm run dev       # http://localhost:5173 (calls /api through the Vite proxy)
```

Example requests (valid and invalid) are in [backend/requests.http](backend/requests.http) for the VS Code REST Client extension.

Webhooks need `WEBHOOK_SECRET_SWIFTPARCEL` and `WEBHOOK_SECRET_NORDCARGO` in `backend/.env` (`openssl rand -hex 32` each). Then send a signed courier update with `npm run simulate:webhook -- --provider swiftparcel --tracking <number> --status in_transit` (in `backend/`). See [docs/webhooks.md](docs/webhooks.md).

In development, `/styleguide` shows every component and state in both themes, using sample text. This page is not included in production builds.

## Why there is no CORS setup

In development the browser only talks to the Vite dev server (`localhost:5173`), and Vite forwards `/api` requests to the backend. For the browser everything has the same origin, so CORS never applies.

CORS will be needed only if the frontend and the API are served from different origins in production, for example `app.example.com` and `api.example.com`. The API would then have to allow that specific origin and answer preflight `OPTIONS` requests. If both are served from one domain (a reverse proxy with `/api`), no CORS setup is needed there either.

## Check

```bash
cd backend
npm run typecheck
npm test                  # unit and API tests, in memory
npm run test:integration  # against PostgreSQL (docker compose up -d db; uses TEST_DATABASE_URL)

cd ../frontend
npm run typecheck
npm run lint
npm test           # Vitest: money parsing, form validation, courier coverage
npm run build
```

## Known limitations

- The mock couriers forget their shipments when the server restarts, so "Ask the courier" answers `SHIPMENT_NOT_FOUND` for parcels shipped before the restart (the orders themselves are kept in PostgreSQL).
- A ship request interrupted by a crash is only closed after 5 minutes, and as `FAILED`: we don't know whether the courier created the shipment, so someone has to check with the courier. No idempotency key is sent to the courier, and there is no outbox that would finish the job automatically ([docs/reliability.md](docs/reliability.md)).
- If the courier accepts a parcel but the answer can't be saved (e.g. the database is down at that moment), the order keeps its shipping lock until the recovery job closes it.
- Webhook processing is not one transaction: the status change (with its event), the receipt in the log and the dedupe record are separate writes. A failure in between can leave a receipt missing; the courier's retry is then handled normally.
- Search uses `ILIKE '%…%'`, which reads the whole table. Fine for thousands of orders; a trigram index (`pg_trgm`) would be the next step.
- The dashboard is computed in TypeScript from all orders on every request (see [Storage](#storage)).
- The Shipments list shows at most 100 rows (no pagination yet).
- Wrong HTTP method on an existing path answers `404`, not `405`.
