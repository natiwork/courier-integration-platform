import type { OrderStatus } from '../domain/orderStatus.js';
import { ALLOWED_TRANSITIONS } from '../domain/orderStatus.js';

// An expected, client-facing error. Carries everything the error handler needs to build a response.
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown[];

  constructor(code: string, message: string, httpStatus: number, details?: unknown[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function orderNotFound(id: string): AppError {
  return new AppError('ORDER_NOT_FOUND', `Order ${id} was not found`, 404);
}

export function invalidStatusTransition(from: OrderStatus, to: OrderStatus): AppError {
  return new AppError(
    'INVALID_STATUS_TRANSITION',
    `Cannot change order status from ${from} to ${to}`,
    409,
    [{ from, to, allowed: ALLOWED_TRANSITIONS[from] }],
  );
}

// Shipping errors. 409 = the order's state doesn't allow it; 422 = the request is valid
// but the courier can't or won't take this parcel; 502 = the courier failed to answer properly.
export function alreadyShipped(orderNumber: string, trackingNumber: string): AppError {
  return new AppError('ALREADY_SHIPPED', `Order ${orderNumber} was already shipped (tracking number ${trackingNumber})`, 409);
}

export function shipmentInProgress(orderNumber: string): AppError {
  return new AppError('SHIPMENT_IN_PROGRESS', `Order ${orderNumber} is already being shipped`, 409);
}

export interface ProviderErrorDetail {
  providerId: string;
  code: string;
  message: string;
}

export function courierCannotTakeOrder(providerName: string, detail: ProviderErrorDetail): AppError {
  return new AppError('COURIER_CANNOT_TAKE_ORDER', `${providerName} can't take this order: ${detail.message}`, 422, [detail]);
}

export function providerRejected(providerName: string, detail: ProviderErrorDetail): AppError {
  return new AppError('PROVIDER_REJECTED', `${providerName} rejected the request: ${detail.message}`, 422, [detail]);
}

export function providerUnavailable(providerName: string, detail: ProviderErrorDetail, consequence = ''): AppError {
  return new AppError(
    'PROVIDER_UNAVAILABLE',
    `${providerName} is temporarily unavailable.${consequence ? ` ${consequence}` : ''}`,
    502,
    [detail],
  );
}

export function orderNotPaid(orderNumber: string, paymentStatus: string): AppError {
  return new AppError(
    'ORDER_NOT_PAID',
    `Order ${orderNumber} is ${paymentStatus.toLowerCase()}: only paid orders can be shipped`,
    409,
    [{ paymentStatus }],
  );
}

export function paymentAlreadyRecorded(orderNumber: string, paymentStatus: string): AppError {
  return new AppError('PAYMENT_ALREADY_RECORDED', `Order ${orderNumber} is already ${paymentStatus.toLowerCase()}`, 409);
}

export function orderCancelled(orderNumber: string): AppError {
  return new AppError('ORDER_CANCELLED', `Order ${orderNumber} is cancelled`, 409);
}

export function providerTimeout(providerName: string, detail: ProviderErrorDetail, consequence: string): AppError {
  return new AppError('PROVIDER_TIMEOUT', `${providerName} did not answer in time. ${consequence}`, 504, [detail]);
}

// Webhooks. 401: we can't trust the sender. 404 for an unknown tracking number on purpose: the courier will
// retry, which helps when its webhook overtook our own write of the tracking number.
export function invalidSignature(): AppError {
  return new AppError('INVALID_SIGNATURE', 'The webhook signature is missing or invalid', 401);
}

export function staleWebhook(toleranceSeconds: number): AppError {
  return new AppError('STALE_WEBHOOK', `The webhook timestamp is more than ${toleranceSeconds} seconds away from now`, 401);
}

export function webhookNotConfigured(providerName: string): AppError {
  return new AppError('WEBHOOK_NOT_CONFIGURED', `Webhooks from ${providerName} are not configured on this server`, 503);
}

export function invalidWebhookPayload(details: unknown[]): AppError {
  return new AppError('INVALID_WEBHOOK_PAYLOAD', 'The webhook body is not a valid event', 400, details);
}

export function unknownTrackingNumber(): AppError {
  return new AppError('UNKNOWN_TRACKING_NUMBER', 'No order has this tracking number (yet)', 404);
}

export function notShipped(orderNumber: string): AppError {
  return new AppError('NOT_SHIPPED', `Order ${orderNumber} has not been handed to a courier yet`, 409);
}

export function demoShipment(orderNumber: string): AppError {
  return new AppError(
    'DEMO_SHIPMENT',
    `Order ${orderNumber} is generated demo data: no courier has a record of its tracking number`,
    409,
  );
}

// Another request changed the same order at the same moment, again and again. Practically never happens;
// the client can simply retry.
export function concurrentUpdate(orderNumber: string): AppError {
  return new AppError('CONCURRENT_UPDATE', `Order ${orderNumber} was changed by another request at the same time. Try again.`, 409);
}

// The recovery job closed this shipping attempt (it looked abandoned) before the courier's answer arrived.
export function shipmentInterrupted(orderNumber: string): AppError {
  return new AppError(
    'SHIPMENT_INTERRUPTED',
    `The shipping attempt for order ${orderNumber} was closed before the courier answered. Check with the courier before trying again.`,
    409,
  );
}
