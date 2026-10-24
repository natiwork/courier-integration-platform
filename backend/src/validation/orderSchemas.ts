import { z } from 'zod';

// Platform-wide limit. Courier providers may enforce stricter limits of their own (Phase 5).
export const MAX_PARCEL_WEIGHT_KG = 100;

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
  parcelWeightKg: z
    .number({
      error: (issue) =>
        issue.input === undefined ? 'Parcel weight is required' : 'Parcel weight must be a number',
    })
    .positive('Parcel weight must be greater than 0')
    .max(MAX_PARCEL_WEIGHT_KG, `Parcel weight must be at most ${MAX_PARCEL_WEIGHT_KG} kg`),
});

// The type is derived from the schema, so the two can never drift apart.
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
