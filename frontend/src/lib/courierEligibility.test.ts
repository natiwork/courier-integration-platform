import { describe, expect, it } from 'vitest';
import type { Courier } from '../api/couriers';
import { courierProblem, isDemoShipment, suggestCourier } from './courierEligibility';

const nordCargo: Courier = {
  id: 'nordcargo',
  name: 'NordCargo',
  mock: true,
  capabilities: {
    maxParcelWeightKg: 30,
    supportedCountries: ['DK', 'SE', 'DE'],
    services: [{ id: 'standard', name: 'Standard' }],
    addressValidation: true,
  },
  health: { status: 'up', latencyMs: 120, checkedAt: '2026-10-24T12:00:00.000Z', simulated: true, note: '' },
};

describe('courierProblem', () => {
  it('accepts an order within the courier limits, including exactly the max weight', () => {
    expect(courierProblem(nordCargo, { destinationCountry: 'SE', parcelWeightKg: 30 })).toBeNull();
  });

  it('names the country it does not serve', () => {
    expect(courierProblem(nordCargo, { destinationCountry: 'IT', parcelWeightKg: 1 })).toBe("Doesn't deliver to Italy");
  });

  it('compares the weight with the courier limit', () => {
    expect(courierProblem(nordCargo, { destinationCountry: 'DE', parcelWeightKg: 42.5 })).toBe(
      'Takes parcels up to 30 kg; this one is 42.5 kg',
    );
  });
});

describe('isDemoShipment', () => {
  it('recognises generated demo tracking numbers only', () => {
    expect(isDemoShipment({ trackingNumber: 'DEMO-SP-123456' })).toBe(true);
    expect(isDemoShipment({ trackingNumber: 'SP0000000001' })).toBe(false);
    expect(isDemoShipment({ trackingNumber: null })).toBe(false);
  });
});

describe('suggestCourier', () => {
  const swiftParcel: Courier = { ...nordCargo, id: 'swiftparcel', name: 'SwiftParcel' };
  const both = [swiftParcel, nordCargo];

  it('starts with the first eligible courier on a first attempt', () => {
    expect(suggestCourier(both)).toEqual({ courier: swiftParcel });
  });

  it('offers the same courier again after a temporary failure', () => {
    expect(suggestCourier(both, { type: 'PROVIDER_UNAVAILABLE', providerId: 'nordcargo' })).toEqual({ courier: nordCargo });
  });

  it('offers the same courier again after a timeout', () => {
    expect(suggestCourier(both, { type: 'PROVIDER_TIMEOUT', providerId: 'nordcargo' })).toEqual({ courier: nordCargo });
  });

  it('suggests another courier, with a note, after a rejection', () => {
    expect(suggestCourier(both, { type: 'SHIPMENT_REJECTED', providerId: 'nordcargo' })).toEqual({
      courier: swiftParcel,
      note: 'NordCargo rejected this order last time, so SwiftParcel is suggested. You can still choose NordCargo.',
    });
  });

  it('keeps the rejecting courier, and says so, when no other courier can take the order', () => {
    expect(suggestCourier([nordCargo], { type: 'SHIPMENT_REJECTED', providerId: 'nordcargo' })).toEqual({
      courier: nordCargo,
      note: 'NordCargo rejected this order last time, and no other courier can take it.',
    });
  });

  it('falls back to the first eligible courier if the previous one can no longer take the order', () => {
    expect(suggestCourier([swiftParcel], { type: 'PROVIDER_UNAVAILABLE', providerId: 'nordcargo' })).toEqual({ courier: swiftParcel });
  });
});
