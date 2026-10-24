import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/appError.js';

// Errors thrown by express.json() (body-parser) carry a `type` and an HTTP `status`.
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as BodyParserError).type === 'string' &&
    typeof (err as BodyParserError).status === 'number'
  );
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new AppError('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    if (err.type === 'entity.too.large') {
      return new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large', 413);
    }
  }
  return new AppError('INTERNAL_ERROR', 'Something went wrong', 500);
}

// The single place that turns errors into HTTP responses.
// Express recognizes an error handler by its four parameters (err, req, res, next).
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  // If the response is already being sent, only Express's default handler can close it properly.
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);

  // Stack traces go to the log only, never into the response.
  if (appError.httpStatus >= 500) {
    console.error(`[${req.requestId}] ${req.method} ${req.originalUrl} failed:`, err);
  }

  res.status(appError.httpStatus).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
      requestId: req.requestId,
    },
  });
};
