import type { RequestHandler } from 'express';
import { SUPPORTED_COUNTRIES } from '../domain/countries.js';
import { PAYMENT_STATUSES } from '../domain/order.js';
import { ORDER_LIMITS } from '../validation/orderSchemas.js';

// Static configuration for clients: which values the order form may offer and the limits it must respect.
// No business logic, so there is no service: the values come straight from the domain and the schema.
export function createMetaController() {
  const orderForm: RequestHandler = (_req, res) => {
    res.status(200).json({
      data: {
        countries: SUPPORTED_COUNTRIES,
        paymentStatuses: PAYMENT_STATUSES,
        limits: ORDER_LIMITS,
      },
    });
  };

  return { orderForm };
}
