import { describe, expect, it } from 'vitest';
import type { OrderLimits } from '../api/meta';
import {
  fieldId,
  lineTotalCents,
  mapServerErrors,
  orderedErrorPaths,
  validateOrderDraft,
  type ItemDraft,
  type OrderDraft,
} from './orderFormValidation';

// The same numbers GET /api/meta/order-form returns (backend ORDER_LIMITS).
const limits: OrderLimits = {
  customerNameMax: 100,
  customerEmailMax: 254,
  deliveryAddressMax: 200,
  destinationCityMax: 100,
  postalCodeMin: 2,
  postalCodeMax: 12,
  skuMin: 3,
  skuMax: 32,
  itemNameMax: 120,
  itemsMax: 50,
  quantityMin: 1,
  quantityMax: 999,
  unitPriceCentsMin: 1,
  unitPriceCentsMax: 10_000_000,
  parcelWeightKgMax: 100,
};
const countries = ['DE', 'FR', 'GB'];

const item = (overrides: Partial<ItemDraft> = {}): ItemDraft => ({
  key: 1,
  sku: 'kit-pour-01',
  name: ' Pour-over set ',
  quantity: '2',
  unitPrice: '12,50',
  ...overrides,
});

const draft = (overrides: Partial<OrderDraft> = {}): OrderDraft => ({
  customerName: '  Lena Vogt ',
  customerEmail: ' Lena.Vogt@Example.com ',
  deliveryAddress: 'Torstraße 12',
  destinationCity: 'Berlin',
  postalCode: '10115',
  destinationCountry: 'DE',
  parcelWeightKg: '2,4',
  paymentStatus: 'UNPAID',
  items: [item()],
  ...overrides,
});

const errorsOf = (d: OrderDraft) => {
  const result = validateOrderDraft(d, limits, countries);
  return result.ok ? {} : result.errors;
};

describe('validateOrderDraft', () => {
  it('builds a normalized payload, the same shape the server expects', () => {
    expect(validateOrderDraft(draft(), limits, countries)).toEqual({
      ok: true,
      payload: {
        customerName: 'Lena Vogt',
        customerEmail: 'lena.vogt@example.com',
        deliveryAddress: 'Torstraße 12',
        destinationCity: 'Berlin',
        postalCode: '10115',
        destinationCountry: 'DE',
        parcelWeightKg: 2.4,
        paymentStatus: 'UNPAID',
        items: [{ sku: 'KIT-POUR-01', name: 'Pour-over set', quantity: 2, unitPriceCents: 1250 }],
      },
    });
  });

  it('reports every missing field with the backend wording', () => {
    const empty = draft({
      customerName: '',
      customerEmail: ' ',
      deliveryAddress: '',
      destinationCity: '',
      postalCode: '',
      destinationCountry: '',
      parcelWeightKg: '',
      items: [item({ sku: '', name: '', quantity: '', unitPrice: '' })],
    });
    expect(errorsOf(empty)).toEqual({
      customerName: 'Customer name is required',
      customerEmail: 'Customer email is required',
      deliveryAddress: 'Delivery address is required',
      destinationCity: 'Destination city is required',
      postalCode: 'Postal code is required',
      destinationCountry: 'Destination country is required',
      parcelWeightKg: 'Parcel weight is required',
      'items.0.sku': 'SKU is required',
      'items.0.name': 'Item name is required',
      'items.0.quantity': 'Quantity is required',
      'items.0.unitPriceCents': 'Unit price is required',
    });
  });

  it.each([
    [{ customerName: 'a'.repeat(101) }, 'customerName', 'Customer name must be at most 100 characters'],
    [{ customerName: 'a'.repeat(100) }, 'customerName', undefined],
    [{ customerEmail: 'lena@' }, 'customerEmail', 'Customer email must be a valid email address'],
    [{ postalCode: '1' }, 'postalCode', 'Postal code must be at least 2 characters'],
    [{ postalCode: '12#45' }, 'postalCode', 'Postal code may contain only letters, digits, spaces and hyphens'],
    [{ destinationCountry: 'US' }, 'destinationCountry', 'Destination country must be a supported European country code, e.g. DE'],
    [{ parcelWeightKg: 'heavy' }, 'parcelWeightKg', 'Parcel weight must be a number'],
    [{ parcelWeightKg: '0' }, 'parcelWeightKg', 'Parcel weight must be greater than 0'],
    [{ parcelWeightKg: '100' }, 'parcelWeightKg', undefined],
    [{ parcelWeightKg: '100.1' }, 'parcelWeightKg', 'Parcel weight must be at most 100 kg'],
    [{ items: [] }, 'items', 'Add at least one item'],
  ])('%o → %s: %s', (overrides, path, message) => {
    expect(errorsOf(draft(overrides))[path]).toBe(message);
  });

  it.each([
    [{ sku: 'a b' }, 'items.0.sku', 'SKU must be 3–32 letters, digits or hyphens'],
    [{ sku: 'ab' }, 'items.0.sku', 'SKU must be 3–32 letters, digits or hyphens'],
    [{ sku: 'a'.repeat(33) }, 'items.0.sku', 'SKU must be at most 32 characters'],
    [{ quantity: '0' }, 'items.0.quantity', 'Quantity must be at least 1'],
    [{ quantity: '1000' }, 'items.0.quantity', 'Quantity must be at most 999'],
    [{ quantity: '1.5' }, 'items.0.quantity', 'Quantity must be a whole number'],
    [{ quantity: 'two' }, 'items.0.quantity', 'Quantity must be a number'],
    [{ unitPrice: '0' }, 'items.0.unitPriceCents', 'Unit price must be between €0.01 and €100,000.00'],
    [{ unitPrice: '100000.01' }, 'items.0.unitPriceCents', 'Unit price must be between €0.01 and €100,000.00'],
    [{ unitPrice: '12.345' }, 'items.0.unitPriceCents', 'Use at most 2 decimal places for the unit price'],
    [{ unitPrice: 'free' }, 'items.0.unitPriceCents', 'Unit price must be a number'],
  ])('item %o → %s: %s', (overrides, path, message) => {
    expect(errorsOf(draft({ items: [item(overrides)] }))[path]).toBe(message);
  });

  it('limits the number of items to what the server accepts', () => {
    const many = Array.from({ length: 51 }, (_, key) => item({ key }));
    expect(errorsOf(draft({ items: many })).items).toBe('An order can have at most 50 items');
  });
});

describe('mapServerErrors', () => {
  it('puts known paths next to their field and everything else in the summary', () => {
    const result = mapServerErrors(
      [
        { path: 'customerEmail', message: 'Customer email must be a valid email address' },
        { path: 'items.1.quantity', message: 'Quantity must be at least 1' },
        { path: 'items.5.sku', message: 'SKU is required' }, // no such row in the form
        { path: '', message: 'Unrecognized key: "coupon"' },
        { path: 'items.0', message: 'Unrecognized key: "discount"' },
      ],
      2,
    );
    expect(result).toEqual({
      fieldErrors: {
        customerEmail: 'Customer email must be a valid email address',
        'items.1.quantity': 'Quantity must be at least 1',
      },
      otherErrors: ['SKU is required', 'Unrecognized key: "coupon"', 'Unrecognized key: "discount"'],
    });
  });
});

describe('helpers', () => {
  it('orders error paths the way fields appear on screen', () => {
    const errors = { 'items.0.quantity': 'x', customerName: 'x', parcelWeightKg: 'x', 'items.0.sku': 'x' };
    expect(orderedErrorPaths(errors, 1)).toEqual(['customerName', 'parcelWeightKg', 'items.0.sku', 'items.0.quantity']);
  });

  it('turns API paths into DOM ids', () => {
    expect(fieldId('items.2.unitPriceCents')).toBe('field-items-2-unitPriceCents');
  });

  it('computes line totals in cents, or null while the input is incomplete', () => {
    expect(lineTotalCents(item({ quantity: '3', unitPrice: '0.10' }))).toBe(30);
    expect(lineTotalCents(item({ quantity: '', unitPrice: '1' }))).toBeNull();
    expect(lineTotalCents(item({ quantity: '2', unitPrice: '1.999' }))).toBeNull();
  });
});
