import { DEMO_TRACKING_PREFIX } from '../domain/order.js';
import { canTransition, type OrderStatus } from '../domain/orderStatus.js';
import { AppError, notShipped } from '../errors/appError.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import { buildSimulatedWebhook } from '../webhooks/simulator.js';
import type { OrderService } from './orderService.js';
import type { WebhookResult, WebhookService } from './webhookService.js';

export interface SimulatorOptions {
  orderId: string;
  providerId: string;
  providerName: string;
  trackingNumber: string;
  demo: boolean; // a generated demo shipment: we update our order, no courier has it
  // The next statuses the courier could send for this order, in its own vocabulary.
  options: { externalStatus: string; status: OrderStatus }[];
}

export interface SimulatedSend {
  sent: { eventId: string; headers: Record<string, string>; body: unknown };
  result: WebhookResult;
}

// Development and demo only (WEBHOOK_SIMULATOR): plays the courier for one of our shipped orders.
// The request is built and signed like the courier's and goes through the real WebhookService, so the
// signature check, deduplication and state machine all run. The secret never leaves the backend.
export class WebhookSimulatorService {
  constructor(
    private readonly orders: OrderService,
    private readonly registry: ProviderRegistry,
    private readonly webhooks: WebhookService,
    private readonly secrets: Record<string, string | undefined>,
  ) {}

  async options(orderId: string): Promise<SimulatorOptions> {
    const { order, provider } = await this.shipped(orderId);
    const spec = provider.webhook;
    const options = spec.statusCodes.flatMap((externalStatus) => {
      const status = spec.normalizeStatus(externalStatus);
      // Only real next steps: statuses the state machine would accept from where the order is now.
      return status && canTransition(order.status, status) ? [{ externalStatus, status }] : [];
    });
    return {
      orderId,
      providerId: provider.id,
      providerName: provider.name,
      trackingNumber: order.trackingNumber!,
      demo: order.trackingNumber!.startsWith(DEMO_TRACKING_PREFIX),
      options,
    };
  }

  async send(orderId: string, externalStatus: string): Promise<SimulatedSend> {
    const available = await this.options(orderId);
    if (!available.options.some((option) => option.externalStatus === externalStatus)) {
      throw new AppError('VALIDATION_ERROR', 'Request body is invalid', 400, [
        {
          path: 'externalStatus',
          message: `${available.providerName} can't send "${externalStatus}" for this order now. Choose one of: ${available.options.map((o) => o.externalStatus).join(', ') || 'none'}`,
        },
      ]);
    }
    const provider = this.registry.get(available.providerId);
    const secret = this.secrets[provider.id];
    const webhook = buildSimulatedWebhook({
      spec: provider.webhook,
      // Without a secret the real endpoint answers 503; signing with an empty key shows exactly that.
      secret: secret ?? '',
      trackingNumber: available.trackingNumber,
      externalStatus,
    });
    const result = await this.webhooks.receive(provider.id, webhook.headers, webhook.rawBody);
    return { sent: { eventId: webhook.eventId, headers: webhook.headers, body: JSON.parse(webhook.rawBody.toString()) }, result };
  }

  private async shipped(orderId: string) {
    const order = await this.orders.getOrderById(orderId);
    if (!order.trackingNumber || !order.courierProvider) throw notShipped(order.orderNumber);
    return { order, provider: this.registry.get(order.courierProvider) };
  }
}
