import { AsyncLocalStorage } from 'node:async_hooks';

// A small structured logger: one JSON object per line on stdout, which log tools can search and filter
// (e.g. every line with requestId "…"). No dependency: we only need levels, fields and the request id.
// Never pass personal data (names, emails, addresses, search terms) as fields; ids and codes only.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
type Fields = Record<string, unknown>;

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Set by the requestId middleware for the whole lifetime of a request, including every await inside it,
// so any log line written while handling the request carries its id without passing it around.
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

let minLevel: LogLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
let sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`);

export function configureLogger(options: { level?: LogLevel; sink?: (line: string) => void }): void {
  if (options.level) minLevel = options.level;
  if (options.sink) sink = options.sink;
}

function write(level: Exclude<LogLevel, 'silent'>, msg: string, fields: Fields = {}): void {
  if (RANK[level] < RANK[minLevel]) return;
  const requestId = requestContext.getStore()?.requestId;
  sink(JSON.stringify({ time: new Date().toISOString(), level, msg, ...(requestId && { requestId }), ...fields }));
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

// Errors don't survive JSON.stringify ({}), so their useful parts are copied out.
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) return { error: { name: error.name, message: error.message, stack: error.stack } };
  return { error: { message: String(error) } };
}
