import { z } from 'zod';
import { LOG_LEVELS, type LogLevel } from '../lib/logger.js';

export const STORAGE_KINDS = ['memory', 'postgres'] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

function webhookSecret(name: string) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, `${name} must be at least 32 characters`).optional(),
  );
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // "true" / "false"; when not set, demo data is on everywhere except production.
  SEED_DEMO_DATA: z.enum(['true', 'false'], 'SEED_DEMO_DATA must be "true" or "false"').optional(),
  // How long one courier call may take. NordCargo usually answers in 0.4–1.2 s; its rare slow answers (2.5–4 s) time out.
  PROVIDER_TIMEOUT_MS: z.coerce
    .number('PROVIDER_TIMEOUT_MS must be a number of milliseconds')
    .int('PROVIDER_TIMEOUT_MS must be a whole number of milliseconds')
    .min(100, 'PROVIDER_TIMEOUT_MS must be at least 100')
    .max(60_000, 'PROVIDER_TIMEOUT_MS must be at most 60000')
    .default(2000),
  // debug | info | warn | error | silent. Default: info (silent under NODE_ENV=test).
  LOG_LEVEL: z.enum(LOG_LEVELS, `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`).optional(),
  // Shared secrets for courier webhook signatures (at least 32 characters; `openssl rand -hex 32`).
  // Empty or missing: that courier's webhook endpoint answers 503 WEBHOOK_NOT_CONFIGURED.
  WEBHOOK_SECRET_SWIFTPARCEL: webhookSecret('WEBHOOK_SECRET_SWIFTPARCEL'),
  WEBHOOK_SECRET_NORDCARGO: webhookSecret('WEBHOOK_SECRET_NORDCARGO'),
  // "true" / "false": the dev-only webhook simulator routes (/api/dev). Default: on everywhere except production.
  WEBHOOK_SIMULATOR: z.enum(['true', 'false'], 'WEBHOOK_SIMULATOR must be "true" or "false"').optional(),
  // Fixes the "random" behaviour of the mock couriers (delays, NordCargo outages). Unset = new every start.
  MOCK_PROVIDER_SEED: z
    .string()
    .regex(/^\d{1,9}$/, 'MOCK_PROVIDER_SEED must be a whole number (up to 9 digits)')
    .transform(Number)
    .optional(),
  // postgres://user:password@host:port/database. Needed for npm run db:migrate and STORAGE=postgres.
  DATABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^postgres(ql)?:\/\/\S+$/, 'DATABASE_URL must start with postgres://').optional(),
  ),
  // memory (default: no database needed, data is lost on restart) | postgres (needs DATABASE_URL).
  STORAGE: z.enum(STORAGE_KINDS, `STORAGE must be one of: ${STORAGE_KINDS.join(', ')}`).default('memory'),
}).refine((env) => env.STORAGE !== 'postgres' || env.DATABASE_URL !== undefined, {
  path: ['DATABASE_URL'],
  message: 'DATABASE_URL is required when STORAGE=postgres',
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  seedDemoData: boolean;
  mockProviderSeed: number | undefined;
  providerTimeoutMs: number;
  logLevel: LogLevel;
  webhookSecrets: Record<string, string | undefined>; // by provider id
  webhookSimulator: boolean;
  databaseUrl: string | undefined;
  storage: StorageKind;
}

// Reads and checks environment variables once at startup. A bad value stops the server with a clear message.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  const {
    NODE_ENV,
    PORT,
    SEED_DEMO_DATA,
    MOCK_PROVIDER_SEED,
    PROVIDER_TIMEOUT_MS,
    LOG_LEVEL,
    WEBHOOK_SECRET_SWIFTPARCEL,
    WEBHOOK_SECRET_NORDCARGO,
    WEBHOOK_SIMULATOR,
    DATABASE_URL,
    STORAGE,
  } = result.data;
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    seedDemoData: SEED_DEMO_DATA === undefined ? NODE_ENV !== 'production' : SEED_DEMO_DATA === 'true',
    mockProviderSeed: MOCK_PROVIDER_SEED,
    providerTimeoutMs: PROVIDER_TIMEOUT_MS,
    logLevel: LOG_LEVEL ?? (NODE_ENV === 'test' ? 'silent' : 'info'),
    webhookSecrets: { swiftparcel: WEBHOOK_SECRET_SWIFTPARCEL, nordcargo: WEBHOOK_SECRET_NORDCARGO },
    webhookSimulator: WEBHOOK_SIMULATOR === undefined ? NODE_ENV !== 'production' : WEBHOOK_SIMULATOR === 'true',
    databaseUrl: DATABASE_URL,
    storage: STORAGE,
  };
}
