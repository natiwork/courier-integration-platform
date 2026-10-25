import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandom } from '../../src/lib/random.js';
import { mapSwiftParcelStatus, SwiftParcelProvider } from '../../src/providers/swiftParcel.js';
import { shipmentInput } from '../fixtures/shipments.js';

const CREATED = new Date('2026-10-24T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function provider(now: () => Date = () => CREATED) {
  return new SwiftParcelProvider({ random: createRandom(1), now, simulateLatency: false });
}

describe('SwiftParcel status mapping', () => {
  it.each([
    ['accepted', 'SHIPPED'],
    ['in_transit', 'IN_TRANSIT'],
    ['out_for_delivery', 'IN_TRANSIT'],
    ['delivered', 'DELIVERED'],
    ['delivery_failed', 'FAILED'],
    ['lost', 'FAILED'],
    ['returned_to_sender', 'RETURNED'],
    ['voided', 'CANCELLED'],
  ])('maps "%s" to %s', (external, internal) => {
    expect(mapSwiftParcelStatus(external)).toBe(internal);
  });

  it.each(['DELIVERED', 'unknown', 'toString', ''])('does not guess a status for "%s"', (external) => {
    expect(mapSwiftParcelStatus(external)).toBeNull();
  });
});

describe('SwiftParcelProvider', () => {
  it('describes itself as a 100 kg courier for every supported country', () => {
    const { capabilities } = provider();
    expect(capabilities.maxParcelWeightKg).toBe(100);
    expect(capabilities.supportedCountries).toHaveLength(31);
    expect(capabilities.services.map((s) => s.id)).toEqual(['express', 'standard']);
    expect(capabilities.addressValidation).toBe(false);
  });

  it('creates a shipment with a tracking number and a normalized status', async () => {
    const result = await provider().createShipment(shipmentInput({ parcelWeightKg: 100, service: 'express' }));

    expect(result).toEqual({
      kind: 'success',
      value: { trackingNumber: expect.stringMatching(/^SP\d{10}$/), status: 'SHIPPED', externalStatus: 'accepted' },
    });
  });

  it('issues unique tracking numbers', async () => {
    const swift = provider();
    const numbers = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = await swift.createShipment(shipmentInput());
      if (result.kind === 'success') numbers.add(result.value.trackingNumber);
    }
    expect(numbers.size).toBe(50);
  });

  it.each([
    [{ parcelWeightKg: 100.1 }, 'WEIGHT_LIMIT_EXCEEDED'],
    [{ service: 'overnight' }, 'UNSUPPORTED_SERVICE'],
  ])('rejects %o permanently with %s', async (overrides, code) => {
    const result = await provider().createShipment(shipmentInput(overrides));
    expect(result).toMatchObject({ kind: 'permanent', code });
  });

  it('reports the shipment status from the time since creation', async () => {
    let now = CREATED;
    const swift = provider(() => now);
    const created = await swift.createShipment(shipmentInput());
    if (created.kind !== 'success') throw new Error('expected success');
    const tracking = created.value.trackingNumber;

    now = new Date(CREATED.getTime() + 7 * HOUR);
    expect(await swift.getShipmentStatus(tracking)).toEqual({
      kind: 'success',
      value: {
        trackingNumber: tracking,
        status: 'IN_TRANSIT',
        externalStatus: 'in_transit',
        updatedAt: new Date(CREATED.getTime() + 6 * HOUR).toISOString(),
      },
    });

    now = new Date(CREATED.getTime() + 31 * HOUR);
    expect(await swift.getShipmentStatus(tracking)).toMatchObject({
      kind: 'success',
      value: { status: 'DELIVERED', externalStatus: 'delivered' },
    });
  });

  it('answers SHIPMENT_NOT_FOUND for a tracking number it never issued', async () => {
    expect(await provider().getShipmentStatus('SP0000000000')).toMatchObject({
      kind: 'permanent',
      code: 'SHIPMENT_NOT_FOUND',
    });
  });

  it('gives the same results for the same seed (and the same start of the running number)', async () => {
    const seeded = () => new SwiftParcelProvider({ random: createRandom(1), now: () => CREATED, simulateLatency: false, trackingNumberStart: 0 });
    const results = await Promise.all([seeded(), seeded()].map((p) => p.createShipment(shipmentInput())));
    expect(results[0]).toEqual(results[1]);
  });

  // With the same seed, a restarted process draws the same digits; the running number must not start over,
  // or it would issue a tracking number an order in the database already has.
  it('continues the running number from where this process started, keeping the seeded digits', async () => {
    const at = (start: number) => new SwiftParcelProvider({ random: createRandom(1), now: () => CREATED, simulateLatency: false, trackingNumberStart: start });
    const first = await at(0).createShipment(shipmentInput());
    const second = await at(42).createShipment(shipmentInput());
    if (first.kind !== 'success' || second.kind !== 'success') throw new Error('expected success');
    expect(first.value.trackingNumber.slice(0, 8)).toBe(second.value.trackingNumber.slice(0, 8));
    expect(first.value.trackingNumber.slice(8)).toBe('0000');
    expect(second.value.trackingNumber.slice(8)).toBe('0042');
  });

  it('reports a simulated, healthy check', async () => {
    expect(await provider().checkHealth()).toEqual({
      status: 'up',
      latencyMs: expect.any(Number),
      checkedAt: CREATED.toISOString(),
      simulated: true,
    });
  });

  describe('simulated latency', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('answers only after the simulated network delay', async () => {
      vi.useFakeTimers();
      // random 0.5 → 80 + 0.5 × (200 − 80) = 140 ms
      const swift = new SwiftParcelProvider({ random: () => 0.5, now: () => CREATED });
      let settled = false;
      const pending = swift.createShipment(shipmentInput()).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(139);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expect((await pending).kind).toBe('success');
    });
  });
});
