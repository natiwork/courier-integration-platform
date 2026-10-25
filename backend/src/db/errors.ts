import { AppError } from '../errors/appError.js';
import { errorFields, logger } from '../lib/logger.js';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
// The server is shutting down or refuses connections, or there are too many.
const UNAVAILABLE_CODES = new Set(['57P01', '57P02', '57P03', '53300']);
// Node network errors when the server can't be reached.
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'EPIPE']);

interface DriverError {
  code?: string;
  constraint?: string;
  message?: string;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as DriverError;
  if (code && (UNAVAILABLE_CODES.has(code) || NETWORK_CODES.has(code) || code.startsWith('08'))) return true;
  // The pool's own messages: no free connection within connectionTimeoutMillis, or the connection dropped.
  return typeof message === 'string' && /timeout exceeded when trying to connect|Connection terminated/i.test(message);
}

// Turns driver errors that mean something to a client into AppErrors; everything else stays a 500.
// The driver's message is logged, never sent: it can name tables, columns or values.
export function toDatabaseError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (isDatabaseUnavailable(error)) {
    logger.error('database unavailable', errorFields(error));
    return new AppError('DATABASE_UNAVAILABLE', 'The database is not available right now. Try again in a moment.', 503);
  }
  if ((error as DriverError | null)?.code === UNIQUE_VIOLATION) {
    logger.warn('unique constraint violated', { constraint: (error as DriverError).constraint });
    return new AppError('DUPLICATE_RECORD', 'A record with the same unique value already exists', 409);
  }
  return error;
}
