import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/appError.js';

function validationError(error: z.ZodError, message: string): AppError {
  const details = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  return new AppError('VALIDATION_ERROR', message, 400, details);
}

// Validates req.body against a schema. On success replaces req.body with the parsed (trimmed, normalized) data.
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error, 'Request body is invalid'));
      return;
    }
    req.body = result.data;
    next();
  };
}

// Validates the query string. In Express 5 req.query is a read-only getter,
// so the parsed values go to res.locals.query instead.
export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error, 'Query parameters are invalid'));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
