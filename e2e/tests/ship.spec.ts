import { expect, test } from '@playwright/test';
import { createOrder } from './support';

test('an unpaid order is marked as paid, shipped with SwiftParcel and gets a tracking number', async ({ page, request }) => {
  const order = await createOrder(request, { paymentStatus: 'UNPAID' });
  await page.goto(`/shipments/${order.id}`);

  const ship = page.getByRole('button', { name: 'Ship with SwiftParcel' });
  await page.getByRole('radio', { name: 'SwiftParcel' }).check();
  await expect(ship).toBeDisabled(); // unpaid orders can't be shipped

  await page.getByRole('button', { name: 'Mark as paid' }).click();
  const payment = page.getByRole('dialog', { name: `Mark ${order.orderNumber} as paid?` });
  await payment.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(payment).toBeHidden();
  await expect(ship).toBeEnabled();

  await ship.click();
  const confirm = page.getByRole('dialog', { name: `Ship ${order.orderNumber} with SwiftParcel?` });
  await confirm.getByRole('button', { name: 'Ship with SwiftParcel' }).click();

  await expect(page.getByRole('button', { name: /^Copy tracking number SP\d{10}$/ })).toBeVisible();
  await expect(page.getByText('Shipped', { exact: true }).first()).toBeVisible();
});

test('a courier that can\'t take the order is disabled and says why', async ({ page, request }) => {
  const order = await createOrder(request, { parcelWeightKg: 42 });
  await page.goto(`/shipments/${order.id}`);

  await expect(page.getByRole('radio', { name: 'NordCargo' })).toBeDisabled();
  await expect(page.getByText('Takes parcels up to 30 kg; this one is 42 kg')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'SwiftParcel' })).toBeEnabled();
});
