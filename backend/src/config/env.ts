import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // "true" / "false"; when not set, demo data is on everywhere except production.
  SEED_DEMO_DATA: z.enum(['true', 'false'], 'SEED_DEMO_DATA must be "true" or "false"').optional(),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  seedDemoData: boolean;
}

// Reads and checks environment variables once at startup. A bad value stops the server with a clear message.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  const { NODE_ENV, PORT, SEED_DEMO_DATA } = result.data;
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    seedDemoData: SEED_DEMO_DATA === undefined ? NODE_ENV !== 'production' : SEED_DEMO_DATA === 'true',
  };
}
