import type { OrderStatus } from '../domain/orderStatus.js';
import { ALLOWED_TRANSITIONS } from '../domain/orderStatus.js';

// An expected, client-facing error. Carries everything the error handler needs to build a response.
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown[];

  constructor(code: string, message: string, httpStatus: number, details?: unknown[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function orderNotFound(id: string): AppError {
  return new AppError('ORDER_NOT_FOUND', `Order ${id} was not found`, 404);
}

export function invalidStatusTransition(from: OrderStatus, to: OrderStatus): AppError {
  return new AppError(
    'INVALID_STATUS_TRANSITION',
    `Cannot change order status from ${from} to ${to}`,
    409,
    [{ from, to, allowed: ALLOWED_TRANSITIONS[from] }],
  );
}
