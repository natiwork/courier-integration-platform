import type { OrderStatus } from '../domain/orderStatus.js';
import type { Queryable } from '../db/query.js';
import { query } from '../db/query.js';
import type { WebhookLog, WebhookOutcome, WebhookReceipt } from './webhookLog.js';

interface ReceiptRow {
  id: string;
  received_at: Date;
  provider_id: string;
  outcome: WebhookOutcome;
  request_id: string | null;
  event_id: string | null;
  tracking_number: string | null;
  external_status: string | null;
  status: OrderStatus | null;
  order_id: string | null;
}

export class PostgresWebhookLog implements WebhookLog {
  constructor(private readonly db: Queryable) {}

  async append(receipt: WebhookReceipt): Promise<void> {
    await query(
      this.db,
      `INSERT INTO webhook_receipts (id, received_at, provider_id, outcome, request_id, event_id, tracking_number, external_status, status, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        receipt.id,
        receipt.receivedAt,
        receipt.providerId,
        receipt.outcome,
        receipt.requestId,
        receipt.eventId,
        receipt.trackingNumber,
        receipt.externalStatus,
        receipt.status,
        receipt.orderId,
      ],
    );
  }

  // Newest first; seq breaks ties between receipts in the same millisecond.
  async recent(limit?: number): Promise<WebhookReceipt[]> {
    const { rows } = await query<ReceiptRow>(this.db, 'SELECT * FROM webhook_receipts ORDER BY received_at DESC, seq DESC LIMIT $1', [
      limit ?? null,
    ]);
    return rows.map((row) => ({
      id: row.id,
      receivedAt: row.received_at.toISOString(),
      providerId: row.provider_id,
      outcome: row.outcome,
      requestId: row.request_id,
      eventId: row.event_id,
      trackingNumber: row.tracking_number,
      externalStatus: row.external_status,
      status: row.status,
      orderId: row.order_id,
    }));
  }
}
