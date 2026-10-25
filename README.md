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
- Every widget and page has its own loading, empty and error state with retry.
- Responsive from 375 px to wide screens: the sidebar turns into an icon rail and then a menu, and tables turn into cards.
- Keyboard-accessible: a skip link, visible focus, focus moves to the new page heading after navigation, and the mobile menu closes with Escape.
- Placeholder pages for New shipment, Couriers and Integrations say honestly that these features aren't built yet.

## Demo data

In development the backend fills its in-memory store with **~1,200 invented demo orders**, about 4–5 a day and growing over time, spread over the last 9 months, so the dashboard has something to show.

- Everything in them is made up: customers (with `@example.com` addresses), addresses, products, and tracking numbers prefixed with `DEMO-`.
- The couriers `SwiftParcel` and `NordCargo` are fictional mock providers and aren't connected.
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
| Updated today | Orders whose status changed today, by their current status. A full event history is not recorded yet. |

## Run it

```bash
nvm use            # Node 24 from .nvmrc

cd backend
npm install
npm run dev        # http://localhost:3000/health, seeds demo data

cd ../frontend     # in a second terminal
npm install
npm run dev        # http://localhost:5173 (calls /api through the Vite proxy)
```

Example requests (valid and invalid) are in [backend/requests.http](backend/requests.http) for the VS Code REST Client extension.

In development, `/styleguide` shows every component and state in both themes, using sample text. This page is not included in production builds.

## Check

```bash
cd backend
npm run typecheck
npm test

cd ../frontend
npm run typecheck
npm run lint
npm run build
```
