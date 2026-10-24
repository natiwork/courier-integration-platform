# Courier Integration Platform

A full-stack platform for managing e-commerce orders and courier service integrations.

> **Work in progress.** Only the features listed below are implemented. Data is kept in memory for now and is lost when the server restarts.

## Implemented

- Backend (Node.js 24, TypeScript, Express 5) with a `GET /health` endpoint.
- Orders REST API:
  - `GET /api/orders` — list orders, newest first
  - `GET /api/orders/:id` — get one order
  - `POST /api/orders` — create an order (`201` with a `Location` header)
- Input validation with Zod (trimmed strings, length limits, email format, parcel weight up to 100 kg, unknown fields rejected).
- Order status state machine with a single transition table — see [docs/state-machine.md](docs/state-machine.md). Status changes are implemented in the service layer; there is no HTTP endpoint for them yet.
- Unified error format with a request id (also sent in the `X-Request-Id` header):

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "path": "customerEmail", "message": "Customer email must be a valid email address" }], "requestId": "…" } }
  ```

  Internal error details and stack traces are logged, never returned to the client.
- Unit and API tests (Vitest + Supertest).
- Frontend foundation (React 19, TypeScript, Vite, React Router):
  - "Editorial Logistics Dashboard" design system built on CSS variables (palette checked for WCAG AA contrast, Barlow Condensed + Atkinson Hyperlegible Next);
  - responsive layout with keyboard-accessible navigation (skip link, visible focus, mobile menu);
  - pages: Overview, Shipments, Shipment details, New shipment, Couriers, Integrations, plus a 404 page;
  - base components: status badge, buttons with a loading state, loading, empty and error states.

  The frontend is **not connected to the API yet**: every page shows an empty state that says so. No sample data is displayed.

## Run the backend

```bash
nvm use            # Node 24 from .nvmrc
cd backend
npm install
npm run dev        # http://localhost:3000/health
```

Example requests (valid and invalid) are in [backend/requests.http](backend/requests.http) for the VS Code REST Client extension.

## Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

In development, `/styleguide` shows every base component and state with sample text. This page is not included in production builds.

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
