# Frontend: LogiFlow

What the web app does, page by page. The overview is in the [README](../README.md).

## Features (React 19, TypeScript, Vite, React Router)

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

## Why there is no CORS setup

In development the browser only talks to the Vite dev server (`localhost:5173`), and Vite forwards `/api` requests to the backend. For the browser everything has the same origin, so CORS never applies.

CORS will be needed only if the frontend and the API are served from different origins in production, for example `app.example.com` and `api.example.com`. The API would then have to allow that specific origin and answer preflight `OPTIONS` requests. If both are served from one domain (a reverse proxy with `/api`), no CORS setup is needed there either.
