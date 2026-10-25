import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/appError.js';
import { createRandom } from '../../src/lib/random.js';
import { createProviderRegistry, NORDCARGO_ID, SWIFTPARCEL_ID } from '../../src/providers/index.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { SwiftParcelProvider } from '../../src/providers/swiftParcel.js';

const registry = () => createProviderRegistry({ seed: 1, simulateLatency: false });

describe('ProviderRegistry', () => {
  it('registers both mock couriers in a fixed order', () => {
    expect(registry().list().map((p) => [p.id, p.name])).toEqual([
      ['swiftparcel', 'SwiftParcel'],
      ['nordcargo', 'NordCargo'],
    ]);
  });

  it('finds a provider by id', () => {
    const providers = registry();
    expect(providers.get(SWIFTPARCEL_ID).name).toBe('SwiftParcel');
    expect(providers.get(NORDCARGO_ID).name).toBe('NordCargo');
    expect(providers.has('nordcargo')).toBe(true);
    expect(providers.has('NordCargo')).toBe(false); // ids, not display names
  });

  it('throws PROVIDER_NOT_FOUND (404) for an unknown id', () => {
    const lookup = () => registry().get('parcelpigeon');
    expect(lookup).toThrow(AppError);
    expect(lookup).toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND', httpStatus: 404 }));
    expect(lookup).toThrow('Courier provider parcelpigeon was not found');
  });

  it('refuses two providers with the same id', () => {
    const providers = new ProviderRegistry();
    providers.register(new SwiftParcelProvider({ random: createRandom(1) }));
    expect(() => providers.register(new SwiftParcelProvider({ random: createRandom(2) }))).toThrow(
      'Courier provider "swiftparcel" is already registered',
    );
  });
});
