import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { requestContext } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// Gives every request an id that appears in error responses and logs.
// Registered first, so even body-parsing errors carry it. Always generated here, never taken from the client,
// so nobody can make their requests look like someone else's in the logs.
export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  // Everything that runs for this request (including after awaits) sees the id: see lib/logger.ts.
  requestContext.run({ requestId: req.requestId }, next);
};
