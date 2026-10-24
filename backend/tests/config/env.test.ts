import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('uses defaults: port 3000 and demo data on outside production', () => {
    expect(loadConfig({})).toEqual({ nodeEnv: 'development', port: 3000, seedDemoData: true });
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
  ])('stops with a clear message for %o', (env, name) => {
    expect(() => loadConfig(env)).toThrow(new RegExp(`Invalid environment variables:[\\s\\S]*${name}`));
  });
});
