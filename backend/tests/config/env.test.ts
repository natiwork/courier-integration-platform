import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('uses defaults: port 3000 and demo data on outside production', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      seedDemoData: true,
      mockProviderSeed: undefined,
      providerTimeoutMs: 2000,
      logLevel: 'info',
      webhookSecrets: { swiftparcel: undefined, nordcargo: undefined },
    });
  });

  it('reads webhook secrets, treating an empty value (as in .env.example) as not set', () => {
    const secret = 'a'.repeat(64);
    expect(loadConfig({ WEBHOOK_SECRET_SWIFTPARCEL: secret, WEBHOOK_SECRET_NORDCARGO: '' }).webhookSecrets).toEqual({
      swiftparcel: secret,
      nordcargo: undefined,
    });
  });

  it('keeps tests quiet by default and lets LOG_LEVEL override it', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
    expect(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('reads PROVIDER_TIMEOUT_MS as milliseconds', () => {
    expect(loadConfig({ PROVIDER_TIMEOUT_MS: '1500' }).providerTimeoutMs).toBe(1500);
  });

  it('reads MOCK_PROVIDER_SEED as a number', () => {
    expect(loadConfig({ MOCK_PROVIDER_SEED: '42' }).mockProviderSeed).toBe(42);
  });

  it('turns demo data off by default in production', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).seedDemoData).toBe(false);
  });

  it('lets SEED_DEMO_DATA override the default in both directions', () => {
    expect(loadConfig({ SEED_DEMO_DATA: 'false' }).seedDemoData).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' }).seedDemoData).toBe(true);
  });

  it('reads PORT as a number', () => {
    expect(loadConfig({ PORT: '4100' }).port).toBe(4100);
  });

  it.each([
    [{ SEED_DEMO_DATA: 'yes' }, 'SEED_DEMO_DATA'],
    [{ PORT: 'abc' }, 'PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ MOCK_PROVIDER_SEED: '' }, 'MOCK_PROVIDER_SEED'],
    [{ PROVIDER_TIMEOUT_MS: '50' }, 'PROVIDER_TIMEOUT_MS'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ WEBHOOK_SECRET_NORDCARGO: 'too-short' }, 'WEBHOOK_SECRET_NORDCARGO'],
    [{ PROVIDER_TIMEOUT_MS: 'soon' }, 'PROVIDER_TIMEOUT_MS'],
    [{ MOCK_PROVIDER_SEED: '1.5' }, 'MOCK_PROVIDER_SEED'],
    [{ MOCK_PROVIDER_SEED: '-3' }, 'MOCK_PROVIDER_SEED'],
  ])('stops with a clear message for %o', (env, name) => {
    expect(() => loadConfig(env)).toThrow(new RegExp(`Invalid environment variables:[\\s\\S]*${name}`));
  });
});
