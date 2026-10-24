import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// Gives every request an id that appears in error responses and logs.
// Registered first, so even body-parsing errors carry it.
export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
