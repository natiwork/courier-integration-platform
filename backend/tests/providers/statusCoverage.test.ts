import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, type OrderStatus } from '../../src/domain/orderStatus.js';
import { NORDCARGO_STATUS_MAP } from '../../src/providers/nordCargo.js';
import { SWIFTPARCEL_STATUS_MAP } from '../../src/providers/swiftParcel.js';

// Which of our 8 statuses each provider can report. The gaps are deliberate and documented
// in docs/courier-providers.md: PENDING and PROCESSING happen on our side before the handover,
// and NordCargo has no cancellation event.
const NOT_REPORTED: Record<string, OrderStatus[]> = {
  swiftparcel: ['PENDING', 'PROCESSING'],
  nordcargo: ['PENDING', 'PROCESSING', 'CANCELLED'],
};

describe.each([
  ['swiftparcel', SWIFTPARCEL_STATUS_MAP],
  ['nordcargo', NORDCARGO_STATUS_MAP],
])('%s status mapping', (providerId, map) => {
  it('covers every internal status except the documented gaps', () => {
    const reported = new Set(Object.values(map));
    const missing = ORDER_STATUSES.filter((status) => !reported.has(status));
    expect(missing).toEqual(NOT_REPORTED[providerId]);
  });

  it('only produces statuses that exist in our domain', () => {
    for (const status of Object.values(map)) {
      expect(ORDER_STATUSES).toContain(status);
    }
  });
});
