import { expect, test } from '@playwright/test';
import { createOrder, shipWithSwiftParcel } from './support';

// The simulator sends a really signed webhook to the backend's real endpoint; only the sender is simulated.
test('a simulated courier webhook moves the order to In transit and the timeline follows', async ({ page, request }) => {
  const order = await createOrder(request, { paymentStatus: 'PAID' });
  const trackingNumber = await shipWithSwiftParcel(request, order.id);
  await page.goto(`/shipments/${order.id}`);
  // exact: the number also appears inside history messages, which load a moment later.
  await expect(page.getByText(trackingNumber, { exact: true })).toBeVisible();

  const simulator = page.getByRole('region', { name: 'Simulate a courier update' });
  await simulator.getByRole('radio', { name: /in_transit/ }).check();
  await simulator.getByRole('button', { name: 'Send signed update' }).click();

  const current = page.locator('li[aria-current="step"]');
  await expect(current).toContainText('In transit');
  await page.getByText(/^Full history/).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Courier webhook (simulated)' }).first()).toBeVisible();
});
