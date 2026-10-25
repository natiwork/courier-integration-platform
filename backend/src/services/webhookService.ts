import { randomUUID } from 'node:crypto';
import type { Order } from '../domain/order.js';
import { canTransition } from '../domain/orderStatus.js';
import {
  AppError,
  invalidSignature,
  invalidWebhookPayload,
  staleWebhook,
  unknownTrackingNumber,
  webhookNotConfigured,
} from '../errors/appError.js';
import { logger, requestContext } from '../lib/logger.js';
import type { CourierProvider } from '../providers/courierProvider.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import { verifyWebhookSignature, WEBHOOK_TOLERANCE_SECONDS, type WebhookEvent } from '../providers/webhooks.js';
import type { InMemoryWebhookEventStore } from '../webhooks/webhookEventStore.js';
import type { InMemoryWebhookLog, WebhookOutcome, WebhookReceipt } from '../webhooks/webhookLog.js';
import type { OrderService } from './orderService.js';

export interface WebhookResult {
  status: 'accepted' | 'duplicate' | 'unchanged' | 'ignored';
  eventId: string;
  reason?: 'invalid_transition' | 'unmapped_status';
}

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// Handles one courier webhook. Answers 2xx for every outcome the courier should NOT send again
// (applied, duplicate, ignored), and an error only where a retry can help or the sender isn't trusted.
export class WebhookService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly orders: OrderService,
    private readonly secrets: Record<string, string | undefined>,
    private readonly dedupe: InMemoryWebhookEventStore,
    private readonly log: InMemoryWebhookLog,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async receive(providerId: string, headers: Headers, rawBody: Buffer): Promise<WebhookResult> {
    const provider = this.registry.get(providerId); // unknown courier: 404 PROVIDER_NOT_FOUND
    const spec = provider.webhook;

    const secret = this.secrets[provider.id];
    if (!secret) {
      await this.record(provider, 'not_configured');
      throw webhookNotConfigured(provider.name);
    }

    const signatureHeader = header(headers, spec.signatureHeader);
    const verification = verifyWebhookSignature({
      secret,
      timestamp: header(headers, spec.timestampHeader),
      signature: signatureHeader === undefined ? undefined : spec.readSignature(signatureHeader),
      rawBody,
      now: this.now(),
    });
    if (!verification.ok) {
      const stale = verification.reason === 'stale';
      await this.record(provider, stale ? 'stale' : 'invalid_signature');
      throw stale ? staleWebhook(WEBHOOK_TOLERANCE_SECONDS) : invalidSignature();
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      await this.record(provider, 'invalid_payload');
      throw invalidWebhookPayload([{ path: '', message: 'The body is not valid JSON' }]);
    }
    const parsed = spec.parse(body);
    if (!parsed.ok) {
      await this.record(provider, 'invalid_payload');
      throw invalidWebhookPayload(parsed.issues);
    }
    const event = parsed.event;

    const claim = await this.dedupe.claim(`${provider.id}:${event.eventId}`);
    if (claim.kind === 'duplicate') {
      await this.record(provider, 'duplicate', event);
      return { status: 'duplicate', eventId: event.eventId };
    }
    try {
      const result = await this.apply(provider, event);
      claim.keep();
      return result;
    } catch (error) {
      claim.release(); // 404 or our own failure: the courier's retry must be handled, not treated as a duplicate
      if (error instanceof AppError && error.code === 'UNKNOWN_TRACKING_NUMBER') {
        await this.record(provider, 'unknown_tracking', event);
      }
      throw error;
    }
  }

  private async apply(provider: CourierProvider, event: WebhookEvent): Promise<WebhookResult> {
    const order = await this.orders.findByTrackingNumber(event.trackingNumber);
    if (!order) throw unknownTrackingNumber();

    const status = provider.webhook.normalizeStatus(event.externalStatus);
    if (!status) {
      await this.ignore(order, provider, event, 'UNMAPPED_STATUS', `${provider.name} reported an unknown status "${event.externalStatus}"`);
      await this.record(provider, 'unmapped_status', event, order);
      return { status: 'ignored', reason: 'unmapped_status', eventId: event.eventId };
    }
    if (status === order.status) {
      // e.g. "out_for_delivery" after "in_transit": both are IN_TRANSIT for us. Nothing to change.
      await this.record(provider, 'unchanged', event, order, status);
      return { status: 'unchanged', eventId: event.eventId };
    }
    if (!canTransition(order.status, status)) {
      // Answered with 200: an error would make the courier resend the same event again and again, and the
      // answer could never change. The mismatch is recorded on the order for someone to look at.
      await this.ignore(
        order,
        provider,
        event,
        'INVALID_TRANSITION',
        `${provider.name} reported ${event.externalStatus} (${status}), but the order is ${order.status}: ignored`,
      );
      await this.record(provider, 'ignored_transition', event, order, status);
      return { status: 'ignored', reason: 'invalid_transition', eventId: event.eventId };
    }

    await this.orders.changeStatus(order.id, status, {
      source: 'webhook',
      providerId: provider.id,
      message: `${provider.name} reported ${event.externalStatus}`,
    });
    await this.record(provider, 'accepted', event, order, status);
    return { status: 'accepted', eventId: event.eventId };
  }

  private ignore(order: Order, provider: CourierProvider, event: WebhookEvent, code: string, message: string): Promise<void> {
    return this.orders.recordNote(order.id, { type: 'WEBHOOK_IGNORED', source: 'webhook', providerId: provider.id, code, message: `${message} (event ${event.eventId})` });
  }

  private async record(
    provider: CourierProvider,
    outcome: WebhookOutcome,
    event?: WebhookEvent,
    order?: Order,
    status?: WebhookReceipt['status'],
  ): Promise<void> {
    const receipt: WebhookReceipt = {
      id: randomUUID(),
      receivedAt: this.now().toISOString(),
      providerId: provider.id,
      outcome,
      requestId: requestContext.getStore()?.requestId ?? null,
      eventId: event?.eventId ?? null,
      trackingNumber: event?.trackingNumber ?? null,
      externalStatus: event?.externalStatus ?? null,
      status: status ?? null,
      orderId: order?.id ?? null,
    };
    await this.log.append(receipt);
    const fields = { provider: provider.id, outcome, eventId: receipt.eventId, orderId: receipt.orderId };
    if (outcome === 'accepted' || outcome === 'duplicate' || outcome === 'unchanged') logger.info('webhook received', fields);
    else logger.warn('webhook received', fields);
  }
}
