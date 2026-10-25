import type { ProviderCapabilities, ProviderHealth } from '../providers/courierProvider.js';
import type { ProviderRegistry } from '../providers/providerRegistry.js';

export interface CourierSummary {
  id: string;
  name: string;
  mock: true; // SwiftParcel and NordCargo are fictional
  capabilities: ProviderCapabilities;
  health: ProviderHealth & { note: string };
}

// Every provider is a mock today, so every health check is simulated. The API says so in words too.
const SIMULATED_NOTE = 'Simulated check: mock provider, no external service is contacted.';

export class CourierService {
  constructor(private readonly registry: ProviderRegistry) {}

  // Checks all providers at the same time, so the slowest one sets the response time, not the sum.
  async listCouriers(): Promise<CourierSummary[]> {
    const providers = this.registry.list();
    const health = await Promise.all(providers.map((provider) => provider.checkHealth()));
    return providers.map((provider, index) => {
      const checked = health[index]!;
      return {
        id: provider.id,
        name: provider.name,
        mock: true,
        capabilities: provider.capabilities,
        health: { ...checked, note: SIMULATED_NOTE },
      };
    });
  }
}
