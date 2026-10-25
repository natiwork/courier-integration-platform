import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/lib/random.js';
import { mapNordCargoStatus, NordCargoProvider } from '../../src/providers/nordCargo.js';
import { scriptedRandom, shipmentInput } from '../fixtures/shipments.js';

const CREATED = new Date('2026-10-24T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

// Every NordCargo call draws two numbers: the delay, then the "is it available?" roll (< 0.2 = unavailable).
const AVAILABLE = 0.9;
const UNAVAILABLE = 0.1;

function provider(random: () => number = () => AVAILABLE, now: () => Date = () => CREATED) {
  return new NordCargoProvider({ random, now, simulateLatency: false });
}

describe('NordCargo status mapping', () => {
  it.each([
    ['NC10', 'SHIPPED'],
    ['NC20', 'IN_TRANSIT'],
    ['NC30', 'IN_TRANSIT'],
    ['NC40', 'DELIVERED'],
    ['NC50', 'FAILED'],
    ['NC60', 'RETURNED'],
  ])('maps %s to %s', (external, internal) => {
    expect(mapNordCargoStatus(external)).toBe(internal);
  });

  it.each(['NC99', 'nc10', 'delivered', ''])('does not guess a status for "%s"', (external) => {
    expect(mapNordCargoStatus(external)).toBeNull();
  });
});

describe('NordCargoProvider', () => {
  it('describes itself as a 30 kg courier for Northern and Central Europe', () => {
    const { capabilities } = provider();
    expect(capabilities.maxParcelWeightKg).toBe(30);
    expect(capabilities.supportedCountries).toEqual(['DK', 'SE', 'NO', 'FI', 'IS', 'EE', 'LV', 'LT', 'DE', 'PL', 'NL']);
    expect(capabilities.services.map((s) => s.id)).toEqual(['standard', 'economy']);
    expect(capabilities.addressValidation).toBe(true);
  });

  it('creates a shipment when it is available and the parcel fits', async () => {
    const result = await provider().createShipment(shipmentInput({ parcelWeightKg: 30 }));

    expect(result).toEqual({
      kind: 'success',
      value: { trackingNumber: expect.stringMatching(/^NC-\d{10}$/), status: 'SHIPPED', externalStatus: 'NC10' },
    });
  });

  it('sometimes answers with a transient error that is worth retrying', async () => {
    const nord = provider(scriptedRandom(0.5, UNAVAILABLE, 0.5, AVAILABLE));

    expect(await nord.createShipment(shipmentInput())).toEqual({
      kind: 'transient',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'NordCargo is temporarily unavailable, try again later',
    });
    // The same request a moment later goes through.
    expect((await nord.createShipment(shipmentInput())).kind).toBe('success');
  });

  it('is unavailable for roughly 20% of calls with a seeded generator', async () => {
    const nord = provider(createRandom(42));
    const results = await Promise.all(Array.from({ length: 500 }, () => nord.createShipment(shipmentInput())));
    const transient = results.filter((r) => r.kind === 'transient').length;
    expect(transient).toBeGreaterThan(70);
    expect(transient).toBeLessThan(130);
  });

  it.each([
    ['a parcel over 30 kg', { parcelWeightKg: 30.1 }, 'WEIGHT_LIMIT_EXCEEDED', 'NordCargo accepts parcels up to 30 kg'],
    [
      'a country it does not serve',
      { address: { street: 'Via Tortona 3', city: 'Milan', postalCode: '20144', country: 'IT' as const } },
      'UNSUPPORTED_DESTINATION',
      'NordCargo does not deliver to IT',
    ],
    [
      'an address without a house number',
      { address: { street: 'Götgatan', city: 'Stockholm', postalCode: '111 20', country: 'SE' as const } },
      'INVALID_ADDRESS',
      'NordCargo requires a house number in the street address',
    ],
    [
      'an address without a postal code',
      { address: { street: 'Götgatan 4', city: 'Stockholm', postalCode: '  ', country: 'SE' as const } },
      'INVALID_ADDRESS',
      'NordCargo requires a postal code',
    ],
    ['an unknown service', { service: 'express' }, 'UNSUPPORTED_SERVICE', 'NordCargo has no "express" service'],
  ])('rejects %s permanently', async (_case, overrides, code, message) => {
    expect(await provider().createShipment(shipmentInput(overrides))).toEqual({ kind: 'permanent', code, message });
  });

  it('validates addresses on request', async () => {
    const nord = provider();
    expect(await nord.validateAddress(shipmentInput().address)).toEqual({ kind: 'success', value: { valid: true } });
    expect(
      await nord.validateAddress({ street: 'Torstraße', city: 'Berlin', postalCode: '10115', country: 'DE' }),
    ).toMatchObject({ kind: 'permanent', code: 'INVALID_ADDRESS' });
  });

  it('reports the shipment status from the time since creation', async () => {
    let now = CREATED;
    const nord = provider(() => AVAILABLE, () => now);
    const created = await nord.createShipment(shipmentInput());
    if (created.kind !== 'success') throw new Error('expected success');
    const tracking = created.value.trackingNumber;

    now = new Date(CREATED.getTime() + 50 * HOUR);
    expect(await nord.getShipmentStatus(tracking)).toEqual({
      kind: 'success',
      value: {
        trackingNumber: tracking,
        status: 'IN_TRANSIT',
        externalStatus: 'NC30',
        updatedAt: new Date(CREATED.getTime() + 48 * HOUR).toISOString(),
      },
    });
  });

  it('answers SHIPMENT_NOT_FOUND for a tracking number it never issued', async () => {
    expect(await provider().getShipmentStatus('NC-0000000000')).toMatchObject({
      kind: 'permanent',
      code: 'SHIPMENT_NOT_FOUND',
    });
  });

  it('reports a failed simulated health check as down', async () => {
    // Health check draws the ping delay, then the "did it respond?" roll (< 0.1 = no answer).
    expect(await provider(scriptedRandom(0.5, 0.05)).checkHealth()).toMatchObject({ status: 'down', simulated: true });
    expect(await provider(scriptedRandom(0.5, 0.5)).checkHealth()).toMatchObject({ status: 'up', simulated: true });
  });
});
