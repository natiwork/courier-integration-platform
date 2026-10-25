import type { Courier } from '../api/couriers';
import type { Order, OrderEvent } from '../types/order';
import { countryName, formatNumber } from './format';

// Why a courier can't take this order, in words for the courier picker, or null if it can.
// Mirrors checkCapabilities in backend/src/providers/capabilities.ts: the server checks again and answers
// 422 COURIER_CANNOT_TAKE_ORDER, so this only saves the user a pointless attempt.
export function courierProblem(courier: Courier, order: Pick<Order, 'destinationCountry' | 'parcelWeightKg'>): string | null {
  const { supportedCountries, maxParcelWeightKg } = courier.capabilities;
  if (!supportedCountries.includes(order.destinationCountry)) {
    return `Doesn't deliver to ${countryName(order.destinationCountry)}`;
  }
  if (order.parcelWeightKg > maxParcelWeightKg) {
    return `Takes parcels up to ${formatNumber(maxParcelWeightKg)} kg; this one is ${formatNumber(order.parcelWeightKg)} kg`;
  }
  return null;
}

// The orders that ship from the demo seed carry tracking numbers no courier issued.
// Mirrors DEMO_TRACKING_PREFIX in backend/src/domain/order.ts.
export const DEMO_TRACKING_PREFIX = 'DEMO-';

export function isDemoShipment(order: Pick<Order, 'trackingNumber'>): boolean {
  return order.trackingNumber?.startsWith(DEMO_TRACKING_PREFIX) ?? false;
}

export interface CourierSuggestion {
  courier: Courier | undefined;
  note?: string; // shown next to the picker when the suggestion isn't the obvious default
}

// Which courier to preselect when a shipment is tried again, based on how the last attempt ended:
// - the courier refused the parcel: it will most likely refuse again, so suggest another courier that can take it;
// - it was unavailable (or timed out): that was temporary, so offer the same courier again.
// The user can always pick any eligible courier; this only sets the starting point.
export function suggestCourier(
  eligible: readonly Courier[],
  lastFailure?: Pick<OrderEvent, 'type' | 'providerId'>,
): CourierSuggestion {
  const previous = lastFailure?.providerId ? eligible.find((courier) => courier.id === lastFailure.providerId) : undefined;
  if (!lastFailure || !previous) return { courier: eligible[0] };

  if (lastFailure.type === 'SHIPMENT_REJECTED') {
    const alternative = eligible.find((courier) => courier.id !== previous.id);
    if (!alternative) {
      return { courier: previous, note: `${previous.name} rejected this order last time, and no other courier can take it.` };
    }
    return {
      courier: alternative,
      note: `${previous.name} rejected this order last time, so ${alternative.name} is suggested. You can still choose ${previous.name}.`,
    };
  }
  return { courier: previous };
}
