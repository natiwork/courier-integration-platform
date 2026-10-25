import {
  permanentError,
  type ProviderCapabilities,
  type ProviderResult,
  type ShipmentInput,
} from './courierProvider.js';

// Used in two places: each provider checks its own limits, and ShipmentService checks them
// before calling the provider at all, so an order that can't fit never reaches the courier.
export function checkCapabilities(
  providerName: string,
  capabilities: ProviderCapabilities,
  input: ShipmentInput,
): ProviderResult<never> | null {
  if (!capabilities.supportedCountries.includes(input.address.country)) {
    return permanentError('UNSUPPORTED_DESTINATION', `${providerName} does not deliver to ${input.address.country}`);
  }
  if (input.parcelWeightKg > capabilities.maxParcelWeightKg) {
    return permanentError(
      'WEIGHT_LIMIT_EXCEEDED',
      `${providerName} accepts parcels up to ${capabilities.maxParcelWeightKg} kg`,
    );
  }
  if (!capabilities.services.some((service) => service.id === input.service)) {
    return permanentError('UNSUPPORTED_SERVICE', `${providerName} has no "${input.service}" service`);
  }
  return null;
}
