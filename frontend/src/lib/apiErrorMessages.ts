import { ApiError } from '../api/client';

export interface ErrorMessage {
  title: string;
  text: string;
}

const FALLBACK: ErrorMessage = { title: 'Something went wrong', text: 'Try again. If it keeps happening, share the request id.' };

function courierText(error: ApiError): string {
  // The courier's own words, e.g. "NordCargo requires a house number in the street address".
  return error.details.find((detail) => detail.providerId)?.message ?? error.message;
}

function withRequestId(message: ErrorMessage, error: ApiError): ErrorMessage {
  return error.requestId ? { ...message, text: `${message.text} Request id: ${error.requestId}.` } : message;
}

// What to tell the user after POST /api/orders/:id/ship failed. One clear message per error code.
export function shipErrorMessage(error: unknown): ErrorMessage {
  if (!(error instanceof ApiError)) return FALLBACK;
  const message = ((): ErrorMessage => {
    switch (error.code) {
      case 'NETWORK_ERROR':
      case 'HTTP_ERROR':
        return { title: 'The server could not be reached', text: `${error.message} The order was not changed.` };
      case 'VALIDATION_ERROR':
        return { title: 'Choose a courier and a service', text: error.details.map((d) => d.message).join(' ') || error.message };
      case 'ORDER_NOT_FOUND':
        return { title: 'This order no longer exists', text: 'Go back to the shipments list.' };
      case 'ALREADY_SHIPPED':
        return { title: 'This order was already shipped', text: `${error.message}. Nothing was sent again.` };
      case 'INVALID_STATUS_TRANSITION':
        return { title: "This order can't be shipped now", text: 'Its status changed in the meantime. The page now shows the current status.' };
      case 'SHIPMENT_IN_PROGRESS':
        return { title: 'This order is already being shipped', text: 'Another request is waiting for the courier. Check the result in a moment.' };
      case 'COURIER_CANNOT_TAKE_ORDER':
        return { title: "This courier can't take the order", text: `${courierText(error)}. Choose another courier. The order was not changed.` };
      case 'PROVIDER_REJECTED':
        return {
          title: 'The courier rejected the shipment',
          text: `${courierText(error)}. The order is marked as failed. Fix the order or choose another courier, then try again.`,
        };
      case 'PROVIDER_UNAVAILABLE':
        return {
          title: 'The courier is temporarily unavailable',
          text: 'The order is marked as failed. Nothing was shipped, so you can safely try again.',
        };
      default:
        return { title: FALLBACK.title, text: error.message };
    }
  })();
  return withRequestId(message, error);
}

// What to tell the user after GET /api/orders/:id/tracking failed. Asking never changes the order.
export function trackingErrorMessage(error: unknown): ErrorMessage {
  if (!(error instanceof ApiError)) return FALLBACK;
  const courierCode = error.details.find((detail) => detail.providerId)?.code;
  const message = ((): ErrorMessage => {
    switch (error.code) {
      case 'NETWORK_ERROR':
      case 'HTTP_ERROR':
        return { title: 'The server could not be reached', text: error.message };
      case 'DEMO_SHIPMENT':
        return { title: 'Demo shipment', text: 'This tracking number was generated with the demo data. No courier has a record of it.' };
      case 'PROVIDER_REJECTED':
        return courierCode === 'SHIPMENT_NOT_FOUND'
          ? {
              title: 'The courier has no record of this shipment',
              text: 'The mock couriers keep shipments in memory and forget them when the server restarts.',
            }
          : { title: 'The courier refused the request', text: courierText(error) };
      case 'PROVIDER_UNAVAILABLE':
        return { title: 'The courier is temporarily unavailable', text: 'Nothing was changed. Try again in a moment.' };
      default:
        return { title: FALLBACK.title, text: error.message };
    }
  })();
  return withRequestId(message, error);
}
