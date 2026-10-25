import type { Order } from '../domain/order.js';
import { logger } from '../lib/logger.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import type { OrderService } from './orderService.js';

// A ship request normally finishes in seconds (at most 3 courier attempts × PROVIDER_TIMEOUT_MS, which is
// capped at 60 s, plus backoff). One whose lock is older than this belongs to a process that died meanwhile.
export const INTERRUPTED_SHIPMENT_AFTER_MS = 5 * 60 * 1000;

export interface RecoveryServiceOptions {
  now?: () => Date;
  afterMs?: number;
}

// Finds ship requests that never finished (deploy, crash, power loss while waiting for the courier) and closes
// them: PROCESSING → FAILED with an event that says what happened. Only the shipping lock counts, never the
// status alone: PROCESSING also means "being prepared in the warehouse", and those orders are left alone.
//
// Marking them FAILED is the smallest honest answer: we don't know whether the courier created the shipment,
// so a person has to check before trying again. The bigger alternative (a transactional outbox with a worker
// that finishes the job) is described in docs/reliability.md.
export class RecoveryService {
  private readonly now: () => Date;
  private readonly afterMs: number;

  constructor(
    private readonly orders: OrderService,
    private readonly registry: ProviderRegistry,
    options: RecoveryServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.afterMs = options.afterMs ?? INTERRUPTED_SHIPMENT_AFTER_MS;
  }

  async recoverInterruptedShipments(): Promise<Order[]> {
    const before = new Date(this.now().getTime() - this.afterMs);
    const stuck = await this.orders.findShippingStartedBefore(before);
    const recovered: Order[] = [];
    for (const order of stuck) {
      const providerId = order.shippingProviderId;
      const courier = providerId && this.registry.has(providerId) ? this.registry.get(providerId).name : 'the courier';
      const result = await this.orders.recoverInterruptedShipment(
        order,
        `Recovered after interruption: the request to ${courier} never finished, so no courier answer was recorded. Check with the courier before trying again.`,
      );
      // null: the request finished at this very moment after all; nothing to recover.
      if (result) {
        recovered.push(result);
        logger.warn('interrupted shipment recovered', { orderId: order.id, provider: providerId, startedAt: order.shippingStartedAt });
      }
    }
    return recovered;
  }
}
