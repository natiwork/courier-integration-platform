import { apiGet } from './client';

// Mirrors ORDER_LIMITS in backend/src/validation/orderSchemas.ts — but the values are fetched, never hard-coded.
export interface OrderLimits {
  customerNameMax: number;
  customerEmailMax: number;
  deliveryAddressMax: number;
  destinationCityMax: number;
  postalCodeMin: number;
  postalCodeMax: number;
  skuMin: number;
  skuMax: number;
  itemNameMax: number;
  itemsMax: number;
  quantityMin: number;
  quantityMax: number;
  unitPriceCentsMin: number;
  unitPriceCentsMax: number;
  parcelWeightKgMax: number;
}

export interface OrderFormOptions {
  countries: string[];
  paymentStatuses: string[];
  limits: OrderLimits;
}

export function getOrderFormOptions(signal?: AbortSignal): Promise<OrderFormOptions> {
  return apiGet<OrderFormOptions>('/api/meta/order-form', signal);
}
