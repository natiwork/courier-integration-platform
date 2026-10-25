import { afterEach, describe, expect, it } from 'vitest';
import { configureLogger, errorFields, logger, requestContext } from '../../src/lib/logger.js';

function capture(level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
  const lines: Record<string, unknown>[] = [];
  configureLogger({ level, sink: (line) => lines.push(JSON.parse(line)) });
  return lines;
}

describe('logger', () => {
  afterEach(() => {
    configureLogger({ level: 'silent' });
  });

  it('writes one JSON object per line with time, level, message and fields', () => {
    const lines = capture();
    logger.info('courier call', { provider: 'nordcargo', attempt: 2 });
    expect(lines).toEqual([
      { time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), level: 'info', msg: 'courier call', provider: 'nordcargo', attempt: 2 },
    ]);
  });

  it('drops lines below the configured level', () => {
    const lines = capture('warn');
    logger.info('noise');
    logger.warn('kept');
    expect(lines.map((line) => line.msg)).toEqual(['kept']);
  });

  it('adds the request id of the request being handled, also after an await', async () => {
    const lines = capture();
    await requestContext.run({ requestId: 'req-42' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.info('inside');
    });
    logger.info('outside');
    expect(lines.map((line) => line.requestId)).toEqual(['req-42', undefined]);
  });

  it('turns an Error into fields JSON can keep', () => {
    expect(errorFields(new TypeError('bad'))).toEqual({ error: { name: 'TypeError', message: 'bad', stack: expect.any(String) } });
    expect(errorFields('plain')).toEqual({ error: { message: 'plain' } });
  });
});
