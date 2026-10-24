# Order status state machine

The transition table lives in one place: [`backend/src/domain/orderStatus.ts`](../backend/src/domain/orderStatus.ts).
Any transition not listed below is rejected with `409 INVALID_STATUS_TRANSITION`.

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PROCESSING
    PROCESSING --> SHIPPED
    PROCESSING --> FAILED
    SHIPPED --> IN_TRANSIT
    SHIPPED --> FAILED
    IN_TRANSIT --> DELIVERED
    IN_TRANSIT --> FAILED
    FAILED --> PROCESSING: retry
    DELIVERED --> [*]
```

| From         | Allowed next statuses  |
|--------------|------------------------|
| `PENDING`    | `PROCESSING`           |
| `PROCESSING` | `SHIPPED`, `FAILED`    |
| `SHIPPED`    | `IN_TRANSIT`, `FAILED` |
| `IN_TRANSIT` | `DELIVERED`, `FAILED`  |
| `DELIVERED`  | — (final)              |
| `FAILED`     | `PROCESSING` (retry)   |

A transition to the same status (e.g. `PENDING → PENDING`) is not a transition and is forbidden too.
