# Testing

How to run every test layer, and how the end-to-end suite is set up. CI runs all of it on every push ([workflow](../.github/workflows/ci.yml)).

## Commands

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

cd ../e2e
npm install
npx playwright install chromium   # once; on Linux/WSL also once: sudo npx playwright install-deps chromium
npm run test:e2e                  # starts its own backend (:3300) and frontend (:5300), then runs the scenarios
npm run test:e2e:report           # the HTML report; failed tests keep a trace and a screenshot in test-results/
```

The e2e tests cover the main user flows in Chromium:
- the Overview numbers match the API, and the theme choice survives a reload;
- search and the status filter update the URL and the rows;
- the order form shows what to fix, and a double click (or two submits in one tick) creates one order;
- an order is marked as paid, shipped with SwiftParcel and gets a tracking number;
- a courier that can't take the order is disabled with the reason;
- a simulated courier webhook moves the order to In transit;
- a widget that fails to load recovers with "Try again" (the only intercepted request);
- at 375 px the menu works, and no page scrolls sideways or logs an error.

Why the e2e backend runs **in memory** (with the demo seed), not on PostgreSQL:
- it starts fast and needs no Docker;
- every run starts from the same 1,200 demo orders, with nothing left over from earlier runs;
- the database itself is already covered by `npm run test:integration`, and the UI flows don't depend on where data is stored (same repository interfaces).

The e2e backend ignores `backend/.env` and uses its own settings, including test-only webhook secrets. Tests run one at a time (one shared backend) and without automatic retries, so a flaky test shows up instead of being hidden.
