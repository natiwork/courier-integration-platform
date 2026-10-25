import { expect, test } from '@playwright/test';
import { API_URL } from './support';

test('the form shows what to fix, then a double click creates exactly one order', async ({ page, request }) => {
  await page.goto('/shipments/new');
  const submit = page.getByRole('button', { name: 'Create shipment' });

  await submit.click();
  await expect(page.getByRole('heading', { name: /^Fix \d+ problems to create the shipment$/ })).toBeVisible();
  // The summary links to each field, and the field shows the same message (the backend's wording).
  await expect(page.getByRole('link', { name: 'Customer name is required' })).toHaveAttribute('href', '#field-customerName');
  await expect(page.getByLabel('Full name')).toHaveAccessibleDescription(/Customer name is required/);
  await expect(page.getByRole('link', { name: 'Parcel weight is required' })).toBeVisible();

  const customerName = `E2E Form ${Date.now().toString(36)}`;
  await page.getByLabel('Full name').fill(customerName);
  await page.getByLabel('Email', { exact: true }).fill('form@example.com');
  await page.getByLabel('Street address').fill('Torstraße 12');
  await page.getByLabel('City', { exact: true }).fill('Berlin');
  await page.getByLabel('Postal code').fill('10115');
  await page.getByLabel('Country').selectOption('DE');
  await page.getByLabel('Parcel weight (kg)').fill('1.5');
  await page.getByLabel('SKU').fill('FLT-100');
  await page.getByLabel('Item name').fill('Paper filters');
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Unit price (€)').fill('4.99');

  // Two clicks in a row: the second must not create a second order.
  await submit.dblclick();

  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('status').filter({ hasText: /^Shipment ORD-\d+ created/ })).toBeVisible();
  const found = await (await request.get(`${API_URL}/api/orders`, { params: { search: customerName } })).json();
  expect(found.data).toHaveLength(1);
  expect(found.data[0]).toMatchObject({ customerName, totalCents: 998, status: 'PENDING' });
});
