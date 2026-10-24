import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';

// Runs only when no route matched. Hands off to errorHandler so the response format stays the same.
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} was not found`, 404));
};
