import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

// One line per finished request: what was asked, the answer's status and how long it took.
// The query string is left out on purpose: ?search= can contain a customer's name.
export const requestLogger: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    logger.info('request finished', {
      // Passed explicitly: the 'finish' event may fire outside the request's async context.
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    });
  });
  next();
};
