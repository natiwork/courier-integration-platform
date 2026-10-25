import { SUPPORTED_COUNTRIES } from '../domain/countries.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import type {
  CallOptions,
  CourierProvider,
  CreatedShipment,
  ProviderCapabilities,
  ProviderHealth,
  ProviderResult,
  ShipmentInput,
  ShipmentStatusReport,
} from './courierProvider.js';
import { checkCapabilities } from './capabilities.js';
import {
  latencyBetween,
  MockShipmentStore,
  simulatedHealthCheck,
  sleep,
  type LatencyRange,
  type MockProviderOptions,
  type TimelineStep,
} from './mockSupport.js';

// SwiftParcel: a FICTIONAL courier (mock). Fast and reliable: it never fails temporarily.
// Its API speaks lowercase status strings.

export const SWIFTPARCEL_ID = 'swiftparcel';

export type SwiftParcelStatus =
  | 'accepted'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'lost'
  | 'returned_to_sender'
  | 'voided';

// Record<> makes TypeScript insist that every SwiftParcel status has a translation.
// PENDING and PROCESSING never come from a courier: they happen on our side before the handover.
export const SWIFTPARCEL_STATUS_MAP: Record<SwiftParcelStatus, OrderStatus> = {
  accepted: 'SHIPPED',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  delivery_failed: 'FAILED',
  lost: 'FAILED',
  returned_to_sender: 'RETURNED',
  voided: 'CANCELLED', // label cancelled before pickup
};

export function mapSwiftParcelStatus(code: string): OrderStatus | null {
  return Object.hasOwn(SWIFTPARCEL_STATUS_MAP, code) ? SWIFTPARCEL_STATUS_MAP[code as SwiftParcelStatus] : null;
}

// The happy path a mock shipment follows over time.
const TIMELINE: TimelineStep<SwiftParcelStatus>[] = [
  { afterHours: 0, code: 'accepted' },
  { afterHours: 6, code: 'in_transit' },
  { afterHours: 24, code: 'out_for_delivery' },
  { afterHours: 30, code: 'delivered' },
];

const CALL_LATENCY: LatencyRange = [80, 200];
const PING_LATENCY: LatencyRange = [20, 60];

export class SwiftParcelProvider implements CourierProvider {
  readonly id = SWIFTPARCEL_ID;
  readonly name = 'SwiftParcel';
  readonly capabilities: ProviderCapabilities = {
    maxParcelWeightKg: 100,
    supportedCountries: SUPPORTED_COUNTRIES,
    services: [
      { id: 'express', name: 'Express' },
      { id: 'standard', name: 'Standard' },
    ],
    addressValidation: false,
  };

  private readonly store: MockShipmentStore<SwiftParcelStatus>;

  constructor(private readonly options: MockProviderOptions) {
    this.store = new MockShipmentStore(TIMELINE, mapSwiftParcelStatus, options.now ?? (() => new Date()));
  }

  async createShipment(input: ShipmentInput, options: CallOptions = {}): Promise<ProviderResult<CreatedShipment>> {
    await this.simulateCall(options.signal);
    const rejection = checkCapabilities(this.name, this.capabilities, input);
    if (rejection) return rejection;
    return this.store.add('SP', this.options.random);
  }

  async getShipmentStatus(trackingNumber: string, options: CallOptions = {}): Promise<ProviderResult<ShipmentStatusReport>> {
    await this.simulateCall(options.signal);
    return this.store.status(this.name, trackingNumber);
  }

  checkHealth(): Promise<ProviderHealth> {
    return simulatedHealthCheck(this.options, PING_LATENCY, 0);
  }

  private async simulateCall(signal?: AbortSignal): Promise<void> {
    const ms = latencyBetween(this.options.random, CALL_LATENCY);
    if (this.options.simulateLatency !== false) await sleep(ms, signal);
  }
}
