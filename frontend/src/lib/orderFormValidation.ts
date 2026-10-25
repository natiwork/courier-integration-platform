import type { ApiErrorDetail } from '../api/client';
import type { OrderLimits } from '../api/meta';
import type { CreateOrderPayload } from '../api/orders';
import type { PaymentStatus } from '../types/order';
import { formatMoney } from './format';
import { parseEuroToCents } from './money';

// Client-side checks for the create-order form.
// They MIRROR backend/src/validation/orderSchemas.ts: same rules, same messages, and the numbers come
// from GET /api/meta/order-form (never hard-coded). The server stays the authority: whatever slips
// through here comes back as a 400 and is shown next to the same field.

export interface ItemDraft {
  key: number; // stable React key; indexes shift when rows are removed
  sku: string;
  name: string;
  quantity: string;
  unitPrice: string; // euros as typed, e.g. "12.50"
}

export interface OrderDraft {
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  destinationCity: string;
  postalCode: string;
  destinationCountry: string;
  parcelWeightKg: string;
  paymentStatus: PaymentStatus;
  items: ItemDraft[];
}

// Errors are keyed by the same paths the API uses: "customerEmail", "items", "items.2.quantity".
export type FieldErrors = Record<string, string>;

export type ValidationResult = { ok: true; payload: CreateOrderPayload } | { ok: false; errors: FieldErrors };

// Same check as Zod's email at the level that matters for a form; the server's check is stricter.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE = /^[A-Za-z0-9 -]+$/;

function requiredText(errors: FieldErrors, path: string, label: string, value: string, max: number): string {
  const text = value.trim();
  if (text === '') errors[path] = `${label} is required`;
  else if (text.length > max) errors[path] = `${label} must be at most ${max} characters`;
  return text;
}

// "2,4" and "2.4" both mean 2.4 kg.
function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

export function itemPath(index: number, field: 'sku' | 'name' | 'quantity' | 'unitPriceCents'): string {
  return `items.${index}.${field}`;
}

export function validateOrderDraft(draft: OrderDraft, limits: OrderLimits, countries: readonly string[]): ValidationResult {
  const errors: FieldErrors = {};

  const customerName = requiredText(errors, 'customerName', 'Customer name', draft.customerName, limits.customerNameMax);
  const customerEmail = requiredText(errors, 'customerEmail', 'Customer email', draft.customerEmail, limits.customerEmailMax).toLowerCase();
  if (!errors.customerEmail && !EMAIL.test(customerEmail)) errors.customerEmail = 'Customer email must be a valid email address';

  const deliveryAddress = requiredText(errors, 'deliveryAddress', 'Delivery address', draft.deliveryAddress, limits.deliveryAddressMax);
  const destinationCity = requiredText(errors, 'destinationCity', 'Destination city', draft.destinationCity, limits.destinationCityMax);

  const postalCode = requiredText(errors, 'postalCode', 'Postal code', draft.postalCode, limits.postalCodeMax);
  if (!errors.postalCode && postalCode.length < limits.postalCodeMin) {
    errors.postalCode = `Postal code must be at least ${limits.postalCodeMin} characters`;
  } else if (!errors.postalCode && !POSTAL_CODE.test(postalCode)) {
    errors.postalCode = 'Postal code may contain only letters, digits, spaces and hyphens';
  }

  const destinationCountry = draft.destinationCountry.trim().toUpperCase();
  if (destinationCountry === '') errors.destinationCountry = 'Destination country is required';
  else if (!countries.includes(destinationCountry)) {
    errors.destinationCountry = 'Destination country must be a supported European country code, e.g. DE';
  }

  const weight = parseDecimal(draft.parcelWeightKg);
  if (draft.parcelWeightKg.trim() === '') errors.parcelWeightKg = 'Parcel weight is required';
  else if (weight === null) errors.parcelWeightKg = 'Parcel weight must be a number';
  else if (weight <= 0) errors.parcelWeightKg = 'Parcel weight must be greater than 0';
  else if (weight > limits.parcelWeightKgMax) errors.parcelWeightKg = `Parcel weight must be at most ${limits.parcelWeightKgMax} kg`;

  if (draft.items.length === 0) errors.items = 'Add at least one item';
  else if (draft.items.length > limits.itemsMax) errors.items = `An order can have at most ${limits.itemsMax} items`;

  const skuPattern = new RegExp(`^[A-Z0-9-]{${limits.skuMin},${limits.skuMax}}$`);
  const unitPriceRange = `Unit price must be between ${formatMoney(limits.unitPriceCentsMin)} and ${formatMoney(limits.unitPriceCentsMax)}`;

  const items = draft.items.map((item, index) => {
    const sku = requiredText(errors, itemPath(index, 'sku'), 'SKU', item.sku, limits.skuMax).toUpperCase();
    if (!errors[itemPath(index, 'sku')] && !skuPattern.test(sku)) {
      errors[itemPath(index, 'sku')] = `SKU must be ${limits.skuMin}–${limits.skuMax} letters, digits or hyphens`;
    }
    const name = requiredText(errors, itemPath(index, 'name'), 'Item name', item.name, limits.itemNameMax);

    const quantityText = item.quantity.trim();
    const quantity = Number(quantityText);
    if (quantityText === '') errors[itemPath(index, 'quantity')] = 'Quantity is required';
    else if (parseDecimal(quantityText) === null) errors[itemPath(index, 'quantity')] = 'Quantity must be a number';
    else if (!/^\d+$/.test(quantityText)) errors[itemPath(index, 'quantity')] = 'Quantity must be a whole number';
    else if (quantity < limits.quantityMin) errors[itemPath(index, 'quantity')] = `Quantity must be at least ${limits.quantityMin}`;
    else if (quantity > limits.quantityMax) errors[itemPath(index, 'quantity')] = `Quantity must be at most ${limits.quantityMax}`;

    const price = parseEuroToCents(item.unitPrice);
    let unitPriceCents = 0;
    if (!price.ok) {
      errors[itemPath(index, 'unitPriceCents')] =
        price.reason === 'empty'
          ? 'Unit price is required'
          : price.reason === 'decimals'
            ? 'Use at most 2 decimal places for the unit price'
            : 'Unit price must be a number';
    } else if (price.cents < limits.unitPriceCentsMin || price.cents > limits.unitPriceCentsMax) {
      errors[itemPath(index, 'unitPriceCents')] = unitPriceRange;
    } else {
      unitPriceCents = price.cents;
    }

    return { sku, name, quantity, unitPriceCents };
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      customerName,
      customerEmail,
      deliveryAddress,
      destinationCity,
      postalCode,
      destinationCountry,
      parcelWeightKg: weight as number,
      paymentStatus: draft.paymentStatus,
      items,
    },
  };
}

const FIELD_PATHS = new Set([
  'customerName',
  'customerEmail',
  'deliveryAddress',
  'destinationCity',
  'postalCode',
  'destinationCountry',
  'parcelWeightKg',
  'paymentStatus',
  'items',
]);
const ITEM_FIELD_PATH = /^items\.(\d+)\.(sku|name|quantity|unitPriceCents)$/;

// Splits the server's 400 details into errors we can show next to a field and the rest
// (e.g. an unknown field, or a path the form doesn't have), which go to the error summary.
export function mapServerErrors(details: readonly ApiErrorDetail[], itemCount: number): { fieldErrors: FieldErrors; otherErrors: string[] } {
  const fieldErrors: FieldErrors = {};
  const otherErrors: string[] = [];
  for (const { path = '', message } of details) {
    const itemMatch = ITEM_FIELD_PATH.exec(path);
    const knownItem = itemMatch !== null && Number(itemMatch[1]) < itemCount;
    if ((FIELD_PATHS.has(path) || knownItem) && !fieldErrors[path]) fieldErrors[path] = message;
    else if (!FIELD_PATHS.has(path) && !knownItem) otherErrors.push(message);
  }
  return { fieldErrors, otherErrors };
}

// The order fields appear in on screen, so the error summary lists problems top to bottom.
export function orderedErrorPaths(errors: FieldErrors, itemCount: number): string[] {
  const order = [
    'customerName',
    'customerEmail',
    'deliveryAddress',
    'destinationCity',
    'postalCode',
    'destinationCountry',
    'parcelWeightKg',
    'items',
    ...Array.from({ length: itemCount }, (_, index) =>
      (['sku', 'name', 'quantity', 'unitPriceCents'] as const).map((field) => itemPath(index, field)),
    ).flat(),
    'paymentStatus',
  ];
  return order.filter((path) => errors[path]);
}

// DOM id for a field, derived from its API path: "items.0.sku" → "field-items-0-sku".
export function fieldId(path: string): string {
  return `field-${path.replace(/\./g, '-')}`;
}

// A line total in cents, or null while the quantity or price isn't a valid number yet.
export function lineTotalCents(item: ItemDraft): number | null {
  const price = parseEuroToCents(item.unitPrice);
  const quantity = item.quantity.trim();
  if (!price.ok || !/^\d+$/.test(quantity)) return null;
  return Number(quantity) * price.cents;
}
