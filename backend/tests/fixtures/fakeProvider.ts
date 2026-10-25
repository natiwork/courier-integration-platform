import { SUPPORTED_COUNTRIES } from '../../src/domain/countries.js';
import type {
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

  constructor(
    readonly id = 'fake',
    readonly name = 'Fake Courier',
  ) {}

  async createShipment(input: ShipmentInput): Promise<ProviderResult<CreatedShipment>> {
    this.calls.push(input);
    if (this.gate) await this.gate;
    return typeof this.next === 'function' ? this.next() : this.next;
  }

  async getShipmentStatus(): Promise<ProviderResult<ShipmentStatusReport>> {
    return this.statusReport;
  }

  async checkHealth(): Promise<ProviderHealth> {
    return { status: 'up', latencyMs: 0, checkedAt: '2026-01-01T00:00:00.000Z', simulated: true };
  }
}
