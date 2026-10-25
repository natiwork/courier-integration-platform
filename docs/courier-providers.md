# Courier providers

Every courier integration implements one interface, `CourierProvider`, in [`backend/src/providers/courierProvider.ts`](../backend/src/providers/courierProvider.ts). The rest of the backend only uses that interface and the `ProviderRegistry`. It never imports a concrete courier.

> **Both couriers are fictional mocks.** `SwiftParcel` and `NordCargo` are not real companies, and no external service is called. Their delays, outages and status progressions are simulated inside the backend.

## The contract

| Member | Purpose |
|---|---|
| `id`, `name` | `id` (`swiftparcel`) is stored on orders. `name` (`SwiftParcel`) is what the UI shows. |
| `capabilities` | Max parcel weight, supported countries, services, and whether the courier validates addresses. |
| `createShipment(input)` | Returns a tracking number and the first normalized status. |
| `getShipmentStatus(trackingNumber)` | Returns the courier's current status, both raw and normalized. |
| `validateAddress?(address)` | Optional. Only couriers that offer it implement it. |
| `checkHealth()` | A quick availability check, shown on the Couriers page. |

Every call returns a `ProviderResult`, a discriminated union:

```ts
| { kind: 'success'; value: T }
| { kind: 'transient'; code: string; message: string } // temporary, worth retrying
| { kind: 'permanent'; code: string; message: string } // the courier said no
```

Business failures are values, not exceptions. The compiler makes callers handle all three kinds, and `kind` tells them whether a retry can help. Exceptions are kept for programming errors, such as an unknown provider id (`PROVIDER_NOT_FOUND`) or a duplicate registration.

Error codes the mocks return:

| Code | Kind | When |
|---|---|---|
| `PROVIDER_UNAVAILABLE` | transient | NordCargo, in about 20% of calls |
| `WEIGHT_LIMIT_EXCEEDED` | permanent | The parcel is over the courier's max weight |
| `UNSUPPORTED_DESTINATION` | permanent | The courier doesn't deliver to that country |
| `UNSUPPORTED_SERVICE` | permanent | Unknown service id |
| `INVALID_ADDRESS` | permanent | NordCargo: no postal code, or no house number in the street |
| `SHIPMENT_NOT_FOUND` | permanent | The courier never issued that tracking number |
| `UNMAPPED_STATUS` | permanent | The courier reported a status we have no translation for |

These results are not exposed over HTTP yet. Shipping an order (Phase 6) will turn permanent errors into `422` and provider failures into `502`/`504`.

## The two mock couriers

| | SwiftParcel | NordCargo |
|---|---|---|
| Max parcel weight | 100 kg (same as the platform) | 30 kg |
| Countries | All 31 platform countries | DK, SE, NO, FI, IS, EE, LV, LT, DE, PL, NL |
| Services | Express, Standard | Standard, Economy |
| Address validation | No | Yes: postal code and house number required |
| Simulated call delay | 80–200 ms | 400–1200 ms |
| Temporary failures | Never | About 20% of calls |
| Tracking number | `SP` + 10 digits | `NC-` + 10 digits |
| Status format | lowercase words | numeric event codes |

Randomness comes from a seeded generator (`backend/src/lib/random.ts`). Tests inject a fixed seed and turn the delays off. The dev server picks a new seed on every start and logs it. Set `MOCK_PROVIDER_SEED` to repeat a run.

A mock shipment's status moves forward with time since creation. For example, SwiftParcel reports `in_transit` after 6 hours and `delivered` after 30 hours. The mocks never produce failures or returns on their own. The mappings below still cover those statuses, so a status update from a courier can be translated.

## Status normalization

Each courier has its own status vocabulary. A `Record<ExternalStatus, OrderStatus>` table per provider translates it into our 8 statuses, and TypeScript fails the build if an external status has no translation. An unknown external status gives `UNMAPPED_STATUS` instead of a guess. The mapping only translates. Whether the transition is allowed is decided by the [state machine](state-machine.md).

| Our status | SwiftParcel | NordCargo |
|---|---|---|
| `PENDING` | not reported | not reported |
| `PROCESSING` | not reported | not reported |
| `SHIPPED` | `accepted` | `NC10` registered |
| `IN_TRANSIT` | `in_transit`, `out_for_delivery` | `NC20` departed hub, `NC30` at local depot |
| `DELIVERED` | `delivered` | `NC40` delivered |
| `FAILED` | `delivery_failed`, `lost` | `NC50` delivery exception |
| `RETURNED` | `returned_to_sender` | `NC60` returned |
| `CANCELLED` | `voided` (label cancelled before pickup) | not reported: NordCargo has no cancellation event |

The gaps are deliberate:
- `PENDING` and `PROCESSING` happen on our side, before the parcel is handed to a courier.
- NordCargo cannot cancel a shipment.

`tests/providers/statusCoverage.test.ts` fails if a mapping gains or loses a status without this list being updated.

## Health on the Couriers page

`GET /api/couriers` runs every provider's `checkHealth()` at the same time, so the slowest courier sets the response time, not the sum of all of them.

For the mocks, the health check **measures the time of a simulated ping**: a short in-process delay, timed with `performance.now()`. NordCargo fails to answer about 10% of the time, and is then reported as `down`. Every check is marked `"simulated": true` and comes with a note saying that no external service is contacted. The Couriers page shows that note on each card.

## Adding a third courier

1. Create `backend/src/providers/<name>.ts`: a class that implements `CourierProvider`, with its own status table and capabilities.
2. Add one line to `createProviderRegistry()` in `backend/src/providers/index.ts`: `registry.register(new NewCourier(...))`.
3. Add `backend/tests/providers/<name>.test.ts`, and the courier's gaps to `statusCoverage.test.ts`.

Nothing else changes. The API, the service and the Couriers page render whatever the registry returns.
