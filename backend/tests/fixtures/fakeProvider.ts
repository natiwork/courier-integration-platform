import { SUPPORTED_COUNTRIES } from '../../src/domain/countries.js';
import type {
  CallOptions,
  CourierProvider,
  CreatedShipment,
  ProviderCapabilities,
  ProviderHealth,
  ProviderResult,
  ShipmentInput,
  ShipmentStatusReport,
} from '../../src/providers/courierProvider.js';

// A courier whose answers the test decides. Records every call, and can hold an answer back
// (`gate`) to simulate a slow courier while another request arrives.
export class FakeProvider implements CourierProvider {
  readonly capabilities: ProviderCapabilities = {
    maxParcelWeightKg: 20,
    supportedCountries: SUPPORTED_COUNTRIES,
    services: [{ id: 'standard', name: 'Standard' }],
    addressValidation: false,
  };
  readonly calls: ShipmentInput[] = [];
  next: ProviderResult<CreatedShipment> | (() => never) = {
    kind: 'success',
    value: { trackingNumber: 'FAKE-0001', status: 'SHIPPED', externalStatus: 'accepted' },
  };
  statusReport: ProviderResult<ShipmentStatusReport> = {
    kind: 'permanent',
    code: 'SHIPMENT_NOT_FOUND',
    message: 'Fake Courier has no such shipment',
  };
  gate: Promise<void> | null = null;
  // The signal of the last call, to check that a timeout really cancels the call.
  lastSignal: AbortSignal | undefined;

  constructor(
    readonly id = 'fake',
    readonly name = 'Fake Courier',
  ) {}

  async createShipment(input: ShipmentInput, options: CallOptions = {}): Promise<ProviderResult<CreatedShipment>> {
    this.calls.push(input);
    this.lastSignal = options.signal;
    if (this.gate) await this.gate;
    return typeof this.next === 'function' ? this.next() : this.next;
  }

  async getShipmentStatus(_trackingNumber: string, options: CallOptions = {}): Promise<ProviderResult<ShipmentStatusReport>> {
    this.lastSignal = options.signal;
    if (this.gate) await this.gate;
    return this.statusReport;
  }

  async checkHealth(): Promise<ProviderHealth> {
    return { status: 'up', latencyMs: 0, checkedAt: '2026-01-01T00:00:00.000Z', simulated: true };
  }
}
