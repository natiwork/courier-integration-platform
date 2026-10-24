import { z } from 'zod';
import { SUPPORTED_COUNTRIES } from '../domain/countries.js';
import { PAYMENT_STATUSES } from '../domain/order.js';
import { ORDER_STATUSES } from '../domain/orderStatus.js';

// Platform-wide limit. Courier providers may enforce stricter limits of their own (Phase 5).
export const MAX_PARCEL_WEIGHT_KG = 100;
export const MAX_ITEMS_PER_ORDER = 50;
export const MAX_ITEM_QUANTITY = 999;
export const MAX_UNIT_PRICE_CENTS = 10_000_000; // €100,000.00

// A trimmed, non-empty string with a length limit and readable error messages.
function requiredString(label: string, max: number) {
  return z
    .string({
      error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be a string`),
    })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

// A whole number in a range, with readable error messages.
function boundedInteger(label: string, min: number, max: number) {
  return z
    .number({
      error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be a number`),
    })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);
}

const OrderItemSchema = z.strictObject({
  sku: requiredString('SKU', 32)
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,32}$/, 'SKU must be 3–32 letters, digits or hyphens'),
  name: requiredString('Item name', 120),
  quantity: boundedInteger('Quantity', 1, MAX_ITEM_QUANTITY),
  unitPriceCents: boundedInteger('Unit price', 1, MAX_UNIT_PRICE_CENTS),
});

export const CreateOrderSchema = z.strictObject({
  customerName: requiredString('Customer name', 100),
  // trim + lowercase run first, then the email format is checked on the cleaned value.
  customerEmail: requiredString('Customer email', 254)
    .toLowerCase()
    .pipe(z.email('Customer email must be a valid email address')),
  deliveryAddress: requiredString('Delivery address', 200),
  destinationCity: requiredString('Destination city', 100),
  postalCode: requiredString('Postal code', 12)
    .min(2, 'Postal code must be at least 2 characters')
    .regex(/^[A-Za-z0-9 -]+$/, 'Postal code may contain only letters, digits, spaces and hyphens'),
  destinationCountry: requiredString('Destination country', 2)
    .toUpperCase()
    .pipe(z.enum(SUPPORTED_COUNTRIES, 'Destination country must be a supported European country code, e.g. DE')),
  items: z
    .array(OrderItemSchema, 'Items must be a list')
    .min(1, 'Add at least one item')
    .max(MAX_ITEMS_PER_ORDER, `An order can have at most ${MAX_ITEMS_PER_ORDER} items`),
  // Optional for the client; a new order is unpaid unless the shop says otherwise.
  paymentStatus: z.enum(PAYMENT_STATUSES, 'Payment status must be PAID, UNPAID or REFUNDED').default('UNPAID'),
  parcelWeightKg: z
    .number({
      error: (issue) =>
        issue.input === undefined ? 'Parcel weight is required' : 'Parcel weight must be a number',
    })
    .positive('Parcel weight must be greater than 0')
    .max(MAX_PARCEL_WEIGHT_KG, `Parcel weight must be at most ${MAX_PARCEL_WEIGHT_KG} kg`),
}, {
  // Missing body or a non-object (array, string...). Other object-level issues keep Zod's default message.
  error: (issue) => (issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined),
});

// The type is derived from the schema, so the two can never drift apart.
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// "?status=" from an empty filter means "no filter", not an invalid status.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// GET /api/orders?search=&status=&limit=. Unknown parameters are ignored.
export const ListOrdersQuerySchema = z.object({
  search: z.preprocess(
    emptyToUndefined,
    z.string('Search must be a single value').trim().max(100, 'Search must be at most 100 characters').optional(),
  ),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(ORDER_STATUSES, `Status must be one of: ${ORDER_STATUSES.join(', ')}`).optional(),
  ),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number('Limit must be a number')
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must be at most 100')
      .optional(),
  ),
});

export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
