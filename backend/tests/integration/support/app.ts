import { createApp, type AppOptions } from '../../../src/app.js';
import type { Pool } from '../../../src/db/pool.js';
import { ProviderRegistry } from '../../../src/providers/providerRegistry.js';
import { createPostgresStorage } from '../../../src/storage.js';
import { FakeProvider } from '../../fixtures/fakeProvider.js';

// One app process on PostgreSQL. Two of these on the same database behave like two server instances.
export function createPostgresApp(pool: Pool, options: AppOptions = {}) {
  const fake = new FakeProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(fake);
  const storage = createPostgresStorage(pool);
  const app = createApp({ ...storage, providerRegistry, ...options });
  return { app, fake, storage };
}

// A paid order to Berlin that the fake courier accepts.
export const paidOrderBody = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  deliveryAddress: 'Torstraße 12',
  destinationCity: 'Berlin',
  postalCode: '10115',
  destinationCountry: 'DE',
  parcelWeightKg: 2.4,
  paymentStatus: 'PAID',
  items: [{ sku: 'KIT-POUR-01', name: 'Pour-over set', quantity: 2, unitPriceCents: 1250 }],
};
