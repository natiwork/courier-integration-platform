import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { SUPPORTED_COUNTRIES } from '../../src/domain/countries.js';
import { NordCargoProvider } from '../../src/providers/nordCargo.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { scriptedRandom } from '../fixtures/shipments.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');

describe('GET /api/couriers', () => {
  it('lists every registered courier with its capabilities and a simulated health check', async () => {
    const res = await request(createApp({ now: () => NOW })).get('/api/couriers').expect(200);

    const health = {
      status: 'up',
      latencyMs: expect.any(Number),
      checkedAt: NOW.toISOString(),
      simulated: true,
      note: 'Simulated check: mock provider, no external service is contacted.',
    };
    expect(res.body.data).toEqual([
      {
        id: 'swiftparcel',
        name: 'SwiftParcel',
        mock: true,
        capabilities: {
          maxParcelWeightKg: 100,
          supportedCountries: [...SUPPORTED_COUNTRIES],
          services: [
            { id: 'express', name: 'Express' },
            { id: 'standard', name: 'Standard' },
          ],
          addressValidation: false,
        },
        health,
      },
      {
        id: 'nordcargo',
        name: 'NordCargo',
        mock: true,
        capabilities: {
          maxParcelWeightKg: 30,
          supportedCountries: ['DK', 'SE', 'NO', 'FI', 'IS', 'EE', 'LV', 'LT', 'DE', 'PL', 'NL'],
          services: [
            { id: 'standard', name: 'Standard' },
            { id: 'economy', name: 'Economy' },
          ],
          addressValidation: true,
        },
        health,
      },
    ]);
  });

  it('reports a courier as down when its simulated check gets no answer', async () => {
    const providerRegistry = new ProviderRegistry();
    // Ping delay, then the "did it respond?" roll: 0.05 is below NordCargo's 10% failure rate.
    providerRegistry.register(new NordCargoProvider({ random: scriptedRandom(0.5, 0.05), simulateLatency: false }));

    const res = await request(createApp({ providerRegistry })).get('/api/couriers').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].health).toMatchObject({ status: 'down', simulated: true });
  });

  it('returns an empty list when no couriers are registered', async () => {
    const res = await request(createApp({ providerRegistry: new ProviderRegistry() }))
      .get('/api/couriers')
      .expect(200);
    expect(res.body).toEqual({ data: [] });
  });
});
