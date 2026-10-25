import type { CountryCode } from '../domain/countries.js';
import type { OrderStatus } from '../domain/orderStatus.js';

// The contract every courier integration implements. The rest of the app only knows this interface,
// so a new courier is a new file plus one registration line in providers/index.ts.

export interface ShipmentAddress {
  street: string; // street and house number, e.g. "Torstraße 12"
  city: string;
  postalCode: string;
  country: CountryCode;
}

// What a provider needs to create a shipment. Built from an Order when it ships (Phase 6).
export interface ShipmentInput {
  orderId: string;
  orderNumber: string;
  recipientName: string;
  address: ShipmentAddress;
  parcelWeightKg: number;
  service: string; // one of capabilities.services[].id
}

export interface CourierService {
  id: string;
  name: string;
}

// What a provider accepts. Shown on the Couriers page and checked before calling the provider.
export interface ProviderCapabilities {
  maxParcelWeightKg: number;
  supportedCountries: readonly CountryCode[];
  services: readonly CourierService[];
  addressValidation: boolean; // true when the provider implements validateAddress
}

// Every provider call ends in one of three ways. Business failures are values, not exceptions:
// the caller has to handle each kind, and the kind says whether a retry can help.
export type ProviderResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'transient'; code: string; message: string } // temporary (e.g. provider unavailable): worth retrying
  | { kind: 'permanent'; code: string; message: string }; // the provider said no: retrying won't help

export function success<T>(value: T): ProviderResult<T> {
  return { kind: 'success', value };
}

export function transientError(code: string, message: string): ProviderResult<never> {
  return { kind: 'transient', code, message };
}

export function permanentError(code: string, message: string): ProviderResult<never> {
  return { kind: 'permanent', code, message };
}

export interface CreatedShipment {
  trackingNumber: string;
  status: OrderStatus; // normalized
  externalStatus: string; // as the provider reported it
}

export interface ShipmentStatusReport {
  trackingNumber: string;
  status: OrderStatus; // normalized
  externalStatus: string; // as the provider reported it
  updatedAt: string; // ISO 8601
}

export interface ProviderHealth {
  status: 'up' | 'down';
  latencyMs: number; // measured round trip of the health check
  checkedAt: string; // ISO 8601
  simulated: true; // all providers are mocks: no external service is contacted
}

export interface CourierProvider {
  readonly id: string; // stable, stored on orders: "swiftparcel"
  readonly name: string; // shown in the UI: "SwiftParcel"
  readonly capabilities: ProviderCapabilities;
  createShipment(input: ShipmentInput): Promise<ProviderResult<CreatedShipment>>;
  getShipmentStatus(trackingNumber: string): Promise<ProviderResult<ShipmentStatusReport>>;
  validateAddress?(address: ShipmentAddress): Promise<ProviderResult<{ valid: true }>>;
  checkHealth(): Promise<ProviderHealth>;
}
