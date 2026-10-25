import { describe, expect, it } from 'vitest';
import type { Courier } from '../api/couriers';
import { courierProblem, isDemoShipment } from './courierEligibility';

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
