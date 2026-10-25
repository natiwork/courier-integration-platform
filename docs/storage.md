# Storage and demo data

Where data lives and how the demo data is generated. The overview is in the [README](../README.md).

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
- **Housekeeping:** at startup and every minute, ship requests whose lock is older than 5 minutes are closed as `FAILED` ("Recovered after interruption", the courier may or may not have the parcel), and expired Idempotency-Keys (24 h) and webhook event ids (7 days) are deleted. See [docs/reliability.md](reliability.md).
- **Dashboard numbers** are still computed in TypeScript from all orders. Fine for thousands of rows; at millions they would move into SQL aggregations (`GROUP BY`, `date_trunc`, `FILTER`).

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

## Local development (without Docker for the app)

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

Example requests (valid and invalid) are in [backend/requests.http](../backend/requests.http) for the VS Code REST Client extension.

Webhooks need `WEBHOOK_SECRET_SWIFTPARCEL` and `WEBHOOK_SECRET_NORDCARGO` in `backend/.env` (`openssl rand -hex 32` each). Then send a signed courier update with `npm run simulate:webhook -- --provider swiftparcel --tracking <number> --status in_transit` (in `backend/`). See [docs/webhooks.md](webhooks.md).

In development, `/styleguide` shows every component and state in both themes, using sample text. This page is not included in production builds.

## Known limitations

- The mock couriers forget their shipments when the server restarts, so "Ask the courier" answers `SHIPMENT_NOT_FOUND` for parcels shipped before the restart (the orders themselves are kept in PostgreSQL).
- A ship request interrupted by a crash is only closed after 5 minutes, and as `FAILED`: we don't know whether the courier created the shipment, so someone has to check with the courier. No idempotency key is sent to the courier, and there is no outbox that would finish the job automatically ([docs/reliability.md](reliability.md)).
- If the courier accepts a parcel but the answer can't be saved (e.g. the database is down at that moment), the order keeps its shipping lock until the recovery job closes it.
- Webhook processing is not one transaction: the status change (with its event), the receipt in the log and the dedupe record are separate writes. A failure in between can leave a receipt missing; the courier's retry is then handled normally.
- Search uses `ILIKE '%…%'`, which reads the whole table. Fine for thousands of orders; a trigram index (`pg_trgm`) would be the next step.
- The dashboard is computed in TypeScript from all orders on every request (see [Storage](#storage)).
- The Shipments list shows at most 100 rows (no pagination yet).
- Wrong HTTP method on an existing path answers `404`, not `405`.
