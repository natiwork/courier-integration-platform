import { z } from 'zod';
import type { CountryCode } from '../domain/countries.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import {
  permanentError,
  success,
  transientError,
  type CallOptions,
  type CourierProvider,
  type CreatedShipment,
  type ProviderCapabilities,
  type ProviderHealth,
  type ProviderResult,
  type ShipmentAddress,
  type ShipmentInput,
  type ShipmentStatusReport,
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
import { parseWith, type WebhookSpec } from './webhooks.js';

// NordCargo: a FICTIONAL courier (mock). Slower, sometimes temporarily unavailable,
// stricter about addresses and weight, and limited to Northern and Central Europe.
// Its API reports numeric event codes instead of words.

export const NORDCARGO_ID = 'nordcargo';

export type NordCargoEventCode = 'NC10' | 'NC20' | 'NC30' | 'NC40' | 'NC50' | 'NC60';

// NordCargo has no cancellation event, so CANCELLED is never reported by it.
// PENDING and PROCESSING never come from a courier: they happen on our side before the handover.
export const NORDCARGO_STATUS_MAP: Record<NordCargoEventCode, OrderStatus> = {
  NC10: 'SHIPPED', // registered
  NC20: 'IN_TRANSIT', // departed hub
  NC30: 'IN_TRANSIT', // at local depot
  NC40: 'DELIVERED',
  NC50: 'FAILED', // delivery exception
  NC60: 'RETURNED',
};

export function mapNordCargoStatus(code: string): OrderStatus | null {
  return Object.hasOwn(NORDCARGO_STATUS_MAP, code) ? NORDCARGO_STATUS_MAP[code as NordCargoEventCode] : null;
}

export const NORDCARGO_COUNTRIES: readonly CountryCode[] = ['DK', 'SE', 'NO', 'FI', 'IS', 'EE', 'LV', 'LT', 'DE', 'PL', 'NL'];
export const NORDCARGO_MAX_WEIGHT_KG = 30; // stricter than the platform's 100 kg

// NordCargo's webhook: camelCase JSON with a nested shipment, plain hex in X-Signature.
const NordCargoWebhookSchema = z.object({
  eventId: z.string().min(1).max(100),
  shipment: z.object({ trackingNo: z.string().min(1).max(64) }),
  eventCode: z.string().min(1).max(16),
  eventTime: z.iso.datetime(),
});

export const NORDCARGO_WEBHOOK: WebhookSpec = {
  signatureHeader: 'x-signature',
  timestampHeader: 'x-timestamp',
  readSignature: (value) => value,
  formatSignature: (hex) => hex,
  parse: parseWith(NordCargoWebhookSchema, (payload) => ({
    eventId: payload.eventId,
    trackingNumber: payload.shipment.trackingNo,
    externalStatus: payload.eventCode,
    occurredAt: payload.eventTime,
  })),
  buildPayload: (event) => ({
    eventId: event.eventId,
    shipment: { trackingNo: event.trackingNumber },
    eventCode: event.externalStatus,
    eventTime: event.occurredAt,
  }),
  normalizeStatus: mapNordCargoStatus,
  statusCodes: Object.keys(NORDCARGO_STATUS_MAP),
};

const TIMELINE: TimelineStep<NordCargoEventCode>[] = [
  { afterHours: 0, code: 'NC10' },
  { afterHours: 12, code: 'NC20' },
  { afterHours: 48, code: 'NC30' },
  { afterHours: 60, code: 'NC40' },
];

const CALL_LATENCY: LatencyRange = [400, 1200];
// Now and then NordCargo takes far longer than usual: longer than our timeout (PROVIDER_TIMEOUT_MS, 2 s by default).
const SLOW_LATENCY: LatencyRange = [2500, 4000];
export const NORDCARGO_SLOW_RESPONSE_RATE = 0.05;
const PING_LATENCY: LatencyRange = [100, 300];
export const NORDCARGO_TRANSIENT_FAILURE_RATE = 0.2; // share of calls answered with "try again later"
export const NORDCARGO_PING_FAILURE_RATE = 0.1;

export class NordCargoProvider implements CourierProvider {
  readonly id = NORDCARGO_ID;
  readonly name = 'NordCargo';
  readonly capabilities: ProviderCapabilities = {
    maxParcelWeightKg: NORDCARGO_MAX_WEIGHT_KG,
    supportedCountries: NORDCARGO_COUNTRIES,
    services: [
      { id: 'standard', name: 'Standard' },
      { id: 'economy', name: 'Economy' },
    ],
    addressValidation: true,
  };

  readonly webhook = NORDCARGO_WEBHOOK;

  private readonly store: MockShipmentStore<NordCargoEventCode>;

  constructor(private readonly options: MockProviderOptions) {
    this.store = new MockShipmentStore(TIMELINE, mapNordCargoStatus, options.now ?? (() => new Date()));
  }

  async createShipment(input: ShipmentInput, options: CallOptions = {}): Promise<ProviderResult<CreatedShipment>> {
    const unavailable = await this.simulateCall(options.signal);
    if (unavailable) return unavailable;

    const rejection = checkCapabilities(this.name, this.capabilities, input) ?? this.addressProblem(input.address);
    if (rejection) return rejection;
    return this.store.add('NC-', this.options.random);
  }

  async getShipmentStatus(trackingNumber: string, options: CallOptions = {}): Promise<ProviderResult<ShipmentStatusReport>> {
    const unavailable = await this.simulateCall(options.signal);
    if (unavailable) return unavailable;
    return this.store.status(this.name, trackingNumber);
  }

  async validateAddress(address: ShipmentAddress, options: CallOptions = {}): Promise<ProviderResult<{ valid: true }>> {
    const unavailable = await this.simulateCall(options.signal);
    if (unavailable) return unavailable;
    return this.addressProblem(address) ?? success({ valid: true });
  }

  checkHealth(): Promise<ProviderHealth> {
    return simulatedHealthCheck(this.options, PING_LATENCY, NORDCARGO_PING_FAILURE_RATE);
  }

  // NordCargo's drivers need a postal code and a house number.
  private addressProblem(address: ShipmentAddress): ProviderResult<never> | null {
    if (address.postalCode.trim() === '') {
      return permanentError('INVALID_ADDRESS', 'NordCargo requires a postal code');
    }
    if (!/\d/.test(address.street)) {
      return permanentError('INVALID_ADDRESS', 'NordCargo requires a house number in the street address');
    }
    return null;
  }

  // Waits like a slow network call (sometimes a very slow one), then sometimes answers "temporarily unavailable".
  // Draws three numbers per call, in this order: slow?, delay, available?
  private async simulateCall(signal?: AbortSignal): Promise<ProviderResult<never> | null> {
    const slow = this.options.random() < NORDCARGO_SLOW_RESPONSE_RATE;
    const ms = latencyBetween(this.options.random, slow ? SLOW_LATENCY : CALL_LATENCY);
    if (this.options.simulateLatency !== false) await sleep(ms, signal);
    if (this.options.random() < NORDCARGO_TRANSIENT_FAILURE_RATE) {
      return transientError('PROVIDER_UNAVAILABLE', 'NordCargo is temporarily unavailable, try again later');
    }
    return null;
  }
}
