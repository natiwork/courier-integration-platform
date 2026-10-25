import type { OrderStatus } from '../domain/orderStatus.js';

// Every webhook request we received and what we did with it, including the ones we refused.
// A rejected signature can't be tied to an order (the body isn't trusted), so this log lives next to the
// order events instead of inside them.

export const WEBHOOK_OUTCOMES = [
  'accepted',
  'duplicate',
  'unchanged',
  'ignored_transition',
  'unmapped_status',
  'unknown_tracking',
  'invalid_signature',
  'stale',
  'invalid_payload',
  'not_configured',
] as const;

export type WebhookOutcome = (typeof WEBHOOK_OUTCOMES)[number];

export interface WebhookReceipt {
  id: string;
  receivedAt: string;
  providerId: string;
  outcome: WebhookOutcome;
  requestId: string | null;
  // Only for requests whose signature checked out: before that, nothing in the body is trusted.
  eventId: string | null;
  trackingNumber: string | null;
  externalStatus: string | null;
  status: OrderStatus | null; // the normalized status, when known
  orderId: string | null;
}

export interface WebhookLog {
  append(receipt: WebhookReceipt): Promise<void>;
  // Newest first.
  recent(limit?: number): Promise<WebhookReceipt[]>;
}

export class InMemoryWebhookLog implements WebhookLog {
  private readonly receipts: WebhookReceipt[] = [];

  async append(receipt: WebhookReceipt): Promise<void> {
    this.receipts.push(structuredClone(receipt));
  }

  // Newest first.
  async recent(limit?: number): Promise<WebhookReceipt[]> {
    return [...this.receipts].reverse().slice(0, limit).map((receipt) => structuredClone(receipt));
  }
}
