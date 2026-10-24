# Order status state machine

The transition table lives in one place: [`backend/src/domain/orderStatus.ts`](../backend/src/domain/orderStatus.ts).
Any transition not listed below is rejected with `409 INVALID_STATUS_TRANSITION`.

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PROCESSING
    PENDING --> CANCELLED
    PROCESSING --> SHIPPED
    PROCESSING --> FAILED
    SHIPPED --> IN_TRANSIT
    SHIPPED --> FAILED
    IN_TRANSIT --> DELIVERED
    IN_TRANSIT --> FAILED
    DELIVERED --> RETURNED
    FAILED --> PROCESSING: retry
    FAILED --> CANCELLED
    CANCELLED --> [*]
    RETURNED --> [*]
```

| From         | Allowed next statuses                 |
|--------------|---------------------------------------|
| `PENDING`    | `PROCESSING`, `CANCELLED`             |
| `PROCESSING` | `SHIPPED`, `FAILED`                   |
| `SHIPPED`    | `IN_TRANSIT`, `FAILED`                |
| `IN_TRANSIT` | `DELIVERED`, `FAILED`                 |
| `DELIVERED`  | `RETURNED`                            |
| `FAILED`     | `PROCESSING` (retry), `CANCELLED`     |
| `CANCELLED`  | — (final)                             |
| `RETURNED`   | — (final)                             |

A transition to the same status (e.g. `PENDING → PENDING`) is not a transition and is forbidden too.
