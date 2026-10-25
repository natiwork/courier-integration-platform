import type { QueryResult, QueryResultRow } from 'pg';
import { toDatabaseError } from './errors.js';
import type { Pool, PoolClient } from './pool.js';

// The pool (each query on any free connection) or one connection inside a transaction.
export type Queryable = Pool | PoolClient;

// Every query goes through here: values are always passed as parameters ($1, $2, ...), never pasted into
// the SQL text, so input can't change the query (SQL injection). Driver errors become AppErrors (503, 409).
export async function query<R extends QueryResultRow>(db: Queryable, text: string, values: unknown[] = []): Promise<QueryResult<R>> {
  try {
    return await db.query<R>(text, values);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

// Runs `work` on one connection between BEGIN and COMMIT. If anything inside throws, ROLLBACK undoes every
// write of the transaction, so the database never keeps half of a change.
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw toDatabaseError(error);
  }
  let broken = false;
  try {
    await query(client, 'BEGIN');
    const result = await work(client);
    await query(client, 'COMMIT');
    return result;
  } catch (error) {
    // If even ROLLBACK fails, the connection is unusable: release(true) closes it instead of reusing it.
    await client.query('ROLLBACK').catch(() => (broken = true));
    throw toDatabaseError(error);
  } finally {
    client.release(broken);
  }
}
