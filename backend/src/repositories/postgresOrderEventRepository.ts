import type { EventSource, OrderEvent, OrderEventType } from '../domain/orderEvent.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import { query, type Queryable } from '../db/query.js';
import type { OrderEventRepository, RecentEventsFilter } from './orderEventRepository.js';

interface EventRow {
  id: string;
  order_id: string;
  type: OrderEventType;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  source: EventSource;
  message: string;
  provider_id: string | null;
  code: string | null;
  attempts: number | null;
  created_at: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toEvent(row: EventRow): OrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    source: row.source,
    message: row.message,
    providerId: row.provider_id,
    code: row.code,
    attempts: row.attempts,
    createdAt: row.created_at.toISOString(),
  };
}

// Events are only inserted: there is no UPDATE or DELETE here. seq (insertion order) breaks ties between
// events with the same timestamp, like the array order does in memory.
export class PostgresOrderEventRepository implements OrderEventRepository {
  constructor(private readonly db: Queryable) {}

  async append(event: OrderEvent): Promise<OrderEvent> {
    await query(
      this.db,
      `INSERT INTO order_events (id, order_id, type, from_status, to_status, source, message, provider_id, code, attempts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.id,
        event.orderId,
        event.type,
        event.fromStatus,
        event.toStatus,
        event.source,
        event.message,
        event.providerId,
        event.code,
        event.attempts,
        event.createdAt,
      ],
    );
    return structuredClone(event);
  }

  async findByOrderId(orderId: string): Promise<OrderEvent[]> {
    if (!UUID.test(orderId)) return [];
    const { rows } = await query<EventRow>(this.db, 'SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at, seq', [orderId]);
    return rows.map(toEvent);
  }

  async findRecent(filter: RecentEventsFilter = {}): Promise<OrderEvent[]> {
    const { rows } = await query<EventRow>(
      this.db,
      `SELECT * FROM order_events
       WHERE ($1::text[] IS NULL OR type = ANY($1)) AND ($2::timestamptz IS NULL OR created_at >= $2)
       ORDER BY created_at DESC, seq DESC
       LIMIT $3`,
      [filter.types ?? null, filter.since ?? null, filter.limit ?? null],
    );
    return rows.map(toEvent);
  }
}
