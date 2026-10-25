import pg from 'pg';
import { errorFields, logger } from '../lib/logger.js';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export interface PoolOptions {
  max?: number; // connections kept open; requests beyond that wait for a free one
}

// A pool keeps a few connections open and lends one to each query, so a request doesn't pay for a new
// TCP connection and login every time.
export function createPool(connectionString: string, options: PoolOptions = {}): Pool {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    // If the database is down, fail after 2 s with 503 instead of letting the request hang.
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
  });
  // An idle connection can break (the database restarted). Without a listener Node would crash the process.
  pool.on('error', (error) => logger.error('idle database connection failed', errorFields(error)));
  return pool;
}
