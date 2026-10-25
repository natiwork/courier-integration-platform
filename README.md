# Courier Integration Platform

A full-stack platform for managing e-commerce orders and courier service integrations. The web app is called **LogiFlow**.

> **Work in progress.** Only the features listed below are implemented. Data is kept in memory for now and is lost when the server restarts. In development the app runs on generated [demo data](#demo-data).

## Implemented

### Backend (Node.js 24, TypeScript, Express 5)

- Orders REST API:
  - `GET /api/orders?search=&status=&limit=` lists orders, newest first. `search` matches the order number, customer name or city (case-insensitive), `status` filters by one status, and `limit` is 1–100.
  - `GET /api/orders/:id` returns one order.
  - `POST /api/orders` creates an order and responds with `201` and a `Location` header.
- Orders have line items, a total that the server computes (integer cents, currency EUR), a payment status (`PAID`, `UNPAID`, `REFUNDED`) and a destination country (ISO code, European countries).
- `GET /api/stats/overview` returns the dashboard numbers, computed from the orders (see [definitions](#dashboard-numbers)).
- `GET /api/meta/order-form` returns the supported countries, payment statuses and every validation limit, so the order form never hard-codes them.
- Courier provider layer (see [docs/courier-providers.md](docs/courier-providers.md)):
  - a common `CourierProvider` interface;
  - results as a `success | transient | permanent` union instead of exceptions;
  - per-provider status normalization;
  - a registry.
  - Two **fictional mock couriers**: `SwiftParcel` (fast, reliable, up to 100 kg) and `NordCargo` (slower, sometimes temporarily unavailable, up to 30 kg, 11 countries, validates addresses). Their delays and outages are simulated with a seeded generator. No real courier is called.
- `GET /api/couriers` lists each courier with its capabilities and a health check. For the mocks the check is a **simulated ping**, labelled `"simulated": true`. Shipping orders through a courier is not built yet.
- Input validation with Zod: trimmed strings, length limits, email format, parcel weight up to 100 kg, validated items, unknown fields rejected. Clients cannot send totals or system fields.
- An order status state machine with a single transition table, including `RETURNED` and `CANCELLED`; see [docs/state-machine.md](docs/state-machine.md). Status changes are implemented in the service layer, but there is no HTTP endpoint for them yet.
- A unified error format with a request id, also sent in the `X-Request-Id` header:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "path": "customerEmail", "message": "Customer email must be a valid email address" }], "requestId": "…" } }
  ```

  Internal error details and stack traces are logged and never returned to the client.
- Environment variables are validated at startup; see `backend/.env.example`.
- Unit and API tests (Vitest + Supertest).

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
  - The timeline is derived from the current status. Exact times are shown only where they are known (when the order was placed and the latest change).
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
- The Integrations page is still a placeholder and says so.

## Demo data

In development the backend fills its in-memory store with **~1,200 invented demo orders**, about 4–5 a day and growing over time, spread over the last 9 months, so the dashboard has something to show.

- Everything in them is made up: customers (with `@example.com` addresses), addresses, products, and tracking numbers prefixed with `DEMO-`.
- Shipped orders name one of the fictional mock couriers by its provider id (`swiftparcel`, `nordcargo`). Each order fits that courier's limits: NordCargo only gets parcels for its 11 countries. The orders were not created through the couriers: the tracking numbers are invented.
- The UI shows a **Demo data** label while this data is loaded.

How it works:
- It is on by default unless `NODE_ENV=production`.
- Turn it off with `SEED_DEMO_DATA=false npm run dev`, or set it in `backend/.env` (see `backend/.env.example`).
- The data is generated from a fixed seed, so it is the same on every start. Only the dates change, because they are relative to "now".

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

## Run it

```bash
nvm use            # Node 24 from .nvmrc

cd backend
npm install
npm run dev        # http://localhost:3000/health, seeds demo data, logs the mock courier seed

cd ../frontend     # in a second terminal
npm install
npm run dev        # http://localhost:5173 (calls /api through the Vite proxy)
```

Example requests (valid and invalid) are in [backend/requests.http](backend/requests.http) for the VS Code REST Client extension.

In development, `/styleguide` shows every component and state in both themes, using sample text. This page is not included in production builds.

## Why there is no CORS setup

In development the browser only talks to the Vite dev server (`localhost:5173`), and Vite forwards `/api` requests to the backend. For the browser everything has the same origin, so CORS never applies.

CORS will be needed only if the frontend and the API are served from different origins in production, for example `app.example.com` and `api.example.com`. The API would then have to allow that specific origin and answer preflight `OPTIONS` requests. If both are served from one domain (a reverse proxy with `/api`), no CORS setup is needed there either.

## Check

```bash
cd backend
npm run typecheck
npm test

cd ../frontend
npm run typecheck
npm run lint
npm test           # Vitest: money parsing, form validation, courier coverage
npm run build
```
