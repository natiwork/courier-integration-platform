import { createRandom } from '../lib/random.js';
import { NordCargoProvider } from './nordCargo.js';
import { ProviderRegistry } from './providerRegistry.js';
import { SwiftParcelProvider } from './swiftParcel.js';

export { NORDCARGO_ID } from './nordCargo.js';
export { SWIFTPARCEL_ID } from './swiftParcel.js';

export interface ProviderRegistryOptions {
  seed: number; // drives every "random" outcome of the mock providers
  simulateLatency: boolean;
  now?: () => Date;
}

// The only place that knows which couriers exist. Adding a courier = a new file + one line here.
export function createProviderRegistry({ seed, simulateLatency, now }: ProviderRegistryOptions): ProviderRegistry {
  const registry = new ProviderRegistry();
  // Each provider gets its own generator, so one provider's calls never change another's outcomes.
  registry.register(new SwiftParcelProvider({ random: createRandom(seed), simulateLatency, now }));
  registry.register(new NordCargoProvider({ random: createRandom(seed + 1), simulateLatency, now }));
  return registry;
}
