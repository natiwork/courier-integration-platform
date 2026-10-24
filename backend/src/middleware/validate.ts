import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/appError.js';

// Validates req.body against a schema. On success replaces req.body with the parsed (trimmed, normalized) data.
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }));
      next(new AppError('VALIDATION_ERROR', 'Request body is invalid', 400, details));
      return;
    }
    req.body = result.data;
    next();
  };
}
