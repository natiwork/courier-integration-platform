import type { Courier } from '../api/couriers';
import type { Order } from '../types/order';
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
