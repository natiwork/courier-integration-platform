# Courier webhooks

A webhook is the courier calling **us** when something happens to a shipment (in transit, delivered, failed). The alternative is *polling*: we would ask the courier "anything new?" on a timer, which wastes requests and only notices a change at the next poll. With webhooks, updates arrive when they happen.

> **Honestly:** both couriers are fictional mocks, so the webhooks are sent by **our simulator**: the `npm run simulate:webhook` command or the "Simulate a courier update" control. The checks on them are real: signature verification, the replay window, deduplication and the state machine. Nothing is skipped for simulated requests, and the server can't tell them apart from a real courier's.

## Endpoint

`POST /api/webhooks/:providerId` (`swiftparcel` or `nordcargo`)

The route reads the **raw body**. It is mounted before `express.json()`, with its own `express.raw()`. The signature is computed over the exact bytes the courier sent: if we parsed the JSON and serialized it again, spacing, key order or escaping could differ, and the signature would no longer match. The body is parsed only after the signature checks out.

## Formats

Every courier has its own payload and header names, like real ones. Each provider describes its format in a `WebhookSpec` ([`providers/webhooks.ts`](../backend/src/providers/webhooks.ts)). The verification code is shared.

**SwiftParcel**

```http
X-SwiftParcel-Signature: sha256=<hex>
X-SwiftParcel-Timestamp: 1792941082

{"id":"evt_1","tracking_number":"SP0619580001","status":"in_transit","occurred_at":"2026-10-25T15:11:22.482Z"}
```

**NordCargo**

```http
X-Signature: <hex>
X-Timestamp: 1792941082

{"eventId":"evt_2","shipment":{"trackingNo":"NC-6959540001"},"eventCode":"NC20","eventTime":"2026-10-25T15:11:22.482Z"}
```

Statuses are translated with each courier's existing table (see [courier-providers.md](courier-providers.md#status-normalization)): SwiftParcel words (`in_transit`, `delivered`…) and NordCargo codes (`NC20`, `NC40`…).

## Signature

```
signature = hex( HMAC-SHA256( secret, timestamp + "." + rawBody ) )
```

- **Secrets** come from the environment: `WEBHOOK_SECRET_SWIFTPARCEL` and `WEBHOOK_SECRET_NORDCARGO`, at least 32 characters each (`openssl rand -hex 32`). `.env.example` has empty placeholders; real values live only in `backend/.env`, which git ignores. Without a secret, that courier's endpoint answers `503 WEBHOOK_NOT_CONFIGURED`.
- **Constant-time comparison:** `crypto.timingSafeEqual`. A normal `===` stops at the first different character, so an attacker measuring response times could find a valid signature one byte at a time. The format (64 hex characters) is checked first, because `timingSafeEqual` needs two buffers of the same length.
- **Replay protection:** the timestamp is part of what is signed, so it can't be changed. Once the signature checks out, a timestamp more than **300 seconds** from now (past or future) is refused. A captured request can't be resent later. A copy resent within those 5 minutes is caught by deduplication.

## What the server answers

| Situation | Answer | Why |
|---|---|---|
| Signature missing or wrong | `401 INVALID_SIGNATURE` | The sender is not trusted; nothing in the body is read or stored. |
| Signed, but older or newer than 5 minutes | `401 STALE_WEBHOOK` | A replay or a broken clock. |
| Signed, but not a valid event | `400 INVALID_WEBHOOK_PAYLOAD` | With the field problems in `details`. |
| Unknown courier | `404 PROVIDER_NOT_FOUND` | |
| Unknown tracking number | `404 UNKNOWN_TRACKING_NUMBER` | On purpose, so the courier retries. A courier can accept a parcel and send its first webhook before our own request has saved the tracking number; the retry a minute later finds it. |
| Event already handled | `200 { status: "duplicate" }` | Nothing changes, no second event. |
| Same status for us (e.g. `out_for_delivery` after `in_transit`) | `200 { status: "unchanged" }` | |
| Unknown courier status | `200 { status: "ignored", reason: "unmapped_status" }` + a warning on the order | A retry would not help. |
| Forbidden transition (e.g. `delivered` for a cancelled order) | `200 { status: "ignored", reason: "invalid_transition" }` + a warning on the order | An error would make the courier resend the same event again and again, and the answer could never change. We record the mismatch (`WEBHOOK_IGNORED`) for a person to look at. |
| Valid next status | `200 { status: "accepted" }` | Applied through `OrderService.changeStatus` with `source: "webhook"`. |

An applied update is an ordinary `OrderEvent`: it shows in the timeline (labelled "Courier webhook (simulated)"), counts in "Updated today", and is part of the audit history. `WEBHOOK_IGNORED`, like `PAYMENT_RECORDED`, keeps the status, so the timeline and "Updated today" skip it.

## Deduplication

Couriers deliver "at least once": after a timeout or an error they send the same event again. Every event id is claimed atomically per courier (`provider:eventId`) before the order is touched ([`webhookEventStore.ts`](../backend/src/webhooks/webhookEventStore.ts)):

- the claim is **kept** for final outcomes (accepted, unchanged, ignored). Later copies, even parallel ones, are answered `duplicate`;
- the claim is **released** when we expect a retry (unknown tracking number, our own 5xx). Otherwise the retry would be dropped as a duplicate, and the update lost. A test covers this: 404, then the tracking number appears, then the retry of the same event is applied;
- a parallel copy waits for the first attempt, so it is either a duplicate or gets its own turn.

Event ids are remembered for 7 days, longer than couriers keep retrying. With `STORAGE=postgres` they are rows in `webhook_events` with the primary key `(provider_id, event_id)`: of two copies arriving at two server processes, only one `INSERT` succeeds.

## Logs and the Integrations page

- Every webhook request is logged as JSON with its `requestId`, courier, outcome, event id and order id, with no personal data.
- Every request is also kept in a webhook log, including refused ones, which can't be tied to an order. The Integrations page shows them next to our own calls to couriers: applied, duplicate, ignored, refused.

## Simulator

**Command** (in `backend/`, with the server running):

```bash
npm run simulate:webhook -- --provider swiftparcel --tracking SP0619580001 --status in_transit
npm run simulate:webhook -- --provider swiftparcel --tracking SP0619580001 --status in_transit --event-id evt_1   # twice: "duplicate"
npm run simulate:webhook -- --provider nordcargo --tracking NC-6959540001 --status NC40 --age 900          # 401 STALE_WEBHOOK
npm run simulate:webhook -- --provider nordcargo --tracking NC-6959540001 --status NC40 --bad-signature    # 401 INVALID_SIGNATURE
```

It reads the secret from `backend/.env`, builds the courier's own JSON, signs it with the same function the server verifies with, and prints the request and the answer. The secret is never printed.

**"Simulate a courier update"** on a shipped order's page:
- offers only the courier's statuses that the state machine accepts from the current status, in the courier's own words;
- the backend signs the request and passes it through the same webhook handling. The secret never reaches the browser;
- dev and demo only: the `/api/dev` routes exist only when `WEBHOOK_SIMULATOR` is on (default: everywhere except production), and `GET /api/meta/features` tells the UI whether to show the control;
- demo orders (`DEMO-…` tracking numbers) can be updated too: the simulator changes **our** order, not any courier's data, and the control says so.

## Try it with curl

```bash
SECRET=$(grep WEBHOOK_SECRET_SWIFTPARCEL backend/.env | cut -d= -f2)
BODY='{"id":"evt_curl_1","tracking_number":"SP0619580001","status":"in_transit","occurred_at":"2026-10-25T15:11:22.482Z"}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -i -X POST http://localhost:3000/api/webhooks/swiftparcel \
  -H 'Content-Type: application/json' \
  -H "X-SwiftParcel-Timestamp: $TS" \
  -H "X-SwiftParcel-Signature: sha256=$SIG" \
  --data-raw "$BODY"
```

Change one character of `$BODY` after computing `$SIG`, and the answer becomes `401 INVALID_SIGNATURE`.

## Limitations

- The webhooks come from our simulator, not from real couriers.
- The simulator doesn't move the mock courier's own timeline. "Ask the courier" (read-only, `getShipmentStatus`) can therefore report something different from the last webhook: they are two independent sources.
- With in-memory storage, deduplication and the webhook log are lost on restart (with PostgreSQL they are kept).
- Handling one webhook is several writes, not one transaction: the status change with its event, the receipt in the log, the dedupe record. A failure in between can leave a receipt missing; the courier's retry is then handled normally.
- If our server is down, the courier's retries are what deliver the update later. Every courier retries for a limited time, so a long outage can lose updates. The fix would be polling `getShipmentStatus` to catch up after downtime (reconciliation).
