import type { Order } from '../domain/order.js';
import { canTransition } from '../domain/orderStatus.js';
import {
  alreadyShipped,
  courierCannotTakeOrder,
  invalidStatusTransition,
  providerRejected,
  providerUnavailable,
  shipmentInProgress,
} from '../errors/appError.js';
import { checkCapabilities } from '../providers/capabilities.js';
import type { CourierProvider, CreatedShipment, ProviderResult, ShipmentInput } from '../providers/courierProvider.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';
import type { ShipOrderInput } from '../validation/shipmentSchemas.js';
import type { OrderService } from './orderService.js';

// Hands an order to a courier. Every status change goes through OrderService, so each step is recorded.
//   PENDING (or FAILED, to try again) → PROCESSING → SHIPPED   courier accepted
//                                                  → FAILED    courier refused (422) or unavailable (502)
export class ShipmentService {
  // Orders with a ship request in flight. Two requests for the same order at the same time would both
  // see PENDING and call the courier twice; the second one is refused instead (Idempotency-Key in Phase 7).
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly orders: OrderService,
    private readonly registry: ProviderRegistry,
  ) {}

  async ship(orderId: string, { providerId, service }: ShipOrderInput): Promise<Order> {
    // Checked and taken before the first await, so no other request can slip in between.
    if (this.inFlight.has(orderId)) {
      const order = await this.orders.getOrderById(orderId);
      throw shipmentInProgress(order.orderNumber);
    }
    this.inFlight.add(orderId);
    try {
      return await this.shipOnce(orderId, this.registry.get(providerId), service);
    } finally {
      this.inFlight.delete(orderId);
    }
  }

  private async shipOnce(orderId: string, provider: CourierProvider, service: string): Promise<Order> {
    const order = await this.orders.getOrderById(orderId);

    // Domain guard: a tracking number means a courier already has this parcel.
    if (order.trackingNumber) throw alreadyShipped(order.orderNumber, order.trackingNumber);
    if (!canTransition(order.status, 'PROCESSING')) throw invalidStatusTransition(order.status, 'PROCESSING');

    const input = shipmentInputFor(order, service);
    // The courier's published limits are checked first: if the parcel can't fit, the courier is never called
    // and the order stays as it was.
    const problem = checkCapabilities(provider.name, provider.capabilities, input);
    if (problem?.kind === 'permanent') {
      throw courierCannotTakeOrder(provider.name, { providerId: provider.id, code: problem.code, message: problem.message });
    }

    const serviceName = provider.capabilities.services.find((s) => s.id === service)?.name ?? service;
    await this.orders.changeStatus(orderId, 'PROCESSING', {
      source: 'api',
      message: `Shipping requested with ${provider.name} (${serviceName})`,
      providerId: provider.id,
    });

    const result = await callProvider(provider, input);
    switch (result.kind) {
      case 'success':
        return this.orders.changeStatus(orderId, 'SHIPPED', {
          type: 'SHIPMENT_CREATED',
          source: 'provider',
          message: `${provider.name} accepted the parcel, tracking number ${result.value.trackingNumber}`,
          providerId: provider.id,
          patch: { courierProvider: provider.id, trackingNumber: result.value.trackingNumber },
        });
      case 'permanent': {
        await this.orders.changeStatus(orderId, 'FAILED', {
          type: 'SHIPMENT_REJECTED',
          source: 'provider',
          message: `${provider.name} rejected the shipment: ${result.message}`,
          providerId: provider.id,
          code: result.code,
        });
        throw providerRejected(provider.name, { providerId: provider.id, code: result.code, message: result.message });
      }
      case 'transient': {
        await this.orders.changeStatus(orderId, 'FAILED', {
          type: 'PROVIDER_UNAVAILABLE',
          source: 'provider',
          message: `${provider.name} was unavailable: ${result.message}`,
          providerId: provider.id,
          code: result.code,
        });
        throw providerUnavailable(
          provider.name,
          { providerId: provider.id, code: result.code, message: result.message },
          'The order was marked as failed; you can try again.',
        );
      }
    }
  }
}

function shipmentInputFor(order: Order, service: string): ShipmentInput {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    recipientName: order.customerName,
    address: {
      street: order.deliveryAddress,
      city: order.destinationCity,
      postalCode: order.postalCode,
      country: order.destinationCountry,
    },
    parcelWeightKg: order.parcelWeightKg,
    service,
  };
}

// A provider should answer with a ProviderResult, but a real integration can still throw (a bug, a bad
// response). Treated as "unavailable", so the order ends up FAILED instead of stuck in PROCESSING.
async function callProvider(provider: CourierProvider, input: ShipmentInput): Promise<ProviderResult<CreatedShipment>> {
  try {
    return await provider.createShipment(input);
  } catch (error) {
    console.error(`[${provider.id}] createShipment threw:`, error);
    return { kind: 'transient', code: 'PROVIDER_ERROR', message: 'The courier returned an unexpected error' };
  }
}
