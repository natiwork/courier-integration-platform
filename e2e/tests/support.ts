import type { APIRequestContext } from '@playwright/test';

export const BACKEND_PORT = 3300;
export const FRONTEND_PORT = 5300;
export const API_URL = `http://localhost:${BACKEND_PORT}`;
export const APP_URL = `http://localhost:${FRONTEND_PORT}`;

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  customerName: string;
}

// Tests that need an order of their own create it through the API, so they never depend on what another test did.
// The customer name is unique per call, so the order can be found again by searching for it.
export async function createOrder(request: APIRequestContext, overrides: Record<string, unknown> = {}): Promise<CreatedOrder> {
  const customerName = `E2E ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;
  const response = await request.post(`${API_URL}/api/orders`, {
    data: {
      customerName,
      customerEmail: 'e2e@example.com',
      deliveryAddress: 'Torstraße 12',
      destinationCity: 'Berlin',
      postalCode: '10115',
      destinationCountry: 'DE',
      parcelWeightKg: 1.5,
      paymentStatus: 'UNPAID',
      items: [{ sku: 'FLT-100', name: 'Paper filters', quantity: 2, unitPriceCents: 499 }],
      ...overrides,
    },
  });
  if (response.status() !== 201) throw new Error(`creating an order failed: ${response.status()} ${await response.text()}`);
  return (await response.json()).data;
}

// Ships a paid order with SwiftParcel (the mock that is never unavailable) and returns its tracking number.
export async function shipWithSwiftParcel(request: APIRequestContext, orderId: string): Promise<string> {
  const response = await request.post(`${API_URL}/api/orders/${orderId}/ship`, { data: { providerId: 'swiftparcel', service: 'standard' } });
  if (response.status() !== 200) throw new Error(`shipping failed: ${response.status()} ${await response.text()}`);
  return (await response.json()).data.trackingNumber;
}
