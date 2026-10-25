import { AppError } from '../errors/appError.js';
import type { CourierProvider } from './courierProvider.js';

// Looks providers up by id. Callers depend on the CourierProvider interface only,
// never on a concrete class, so they don't change when a courier is added.
export class ProviderRegistry {
  private readonly providers = new Map<string, CourierProvider>();

  register(provider: CourierProvider): void {
    // A programming error, not a client error: two integrations must never share an id.
    if (this.providers.has(provider.id)) {
      throw new Error(`Courier provider "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): CourierProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', `Courier provider ${id} was not found`, 404);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  // In registration order.
  list(): CourierProvider[] {
    return [...this.providers.values()];
  }
}
