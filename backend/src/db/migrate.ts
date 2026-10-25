import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.js';
import { query } from './query.js';

// backend/migrations, both from src/db (tsx) and from dist/db (the build).
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

// Any fixed number: every process that migrates takes the same lock, so two servers starting at once
// can't apply the same file twice.
const MIGRATION_LOCK_ID = 9_000_001;

const FILE_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

// Applies the migration files that haven't been applied yet, in file-name order (001_, 002_, ...).
// Each file runs in its own transaction together with its row in schema_migrations: a file is either
// applied completely and recorded, or not at all. Applied files are never edited; a change is a new file.
// Returns the names of the files applied now.
export async function migrate(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(done.rows.map((row) => row.name));

    const files = (await readdir(dir)).filter((file) => FILE_NAME.test(file)).sort();
    const appliedNow: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
      appliedNow.push(file);
    }
    return appliedNow;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

// Files not applied yet. The server refuses to start on an outdated schema instead of failing on the first query.
export async function pendingMigrations(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((file) => FILE_NAME.test(file)).sort();
  const table = await query<{ exists: boolean }>(pool, "SELECT to_regclass('schema_migrations') IS NOT NULL AS exists");
  if (!table.rows[0]?.exists) return files;
  const done = await query<{ name: string }>(pool, 'SELECT name FROM schema_migrations');
  const applied = new Set(done.rows.map((row) => row.name));
  return files.filter((file) => !applied.has(file));
}
