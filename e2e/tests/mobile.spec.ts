import { expect, test, type Page } from '@playwright/test';
import { createOrder } from './support';

test.use({ viewport: { width: 375, height: 812 } });

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test('the menu opens and closes, and navigating closes it', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Shipments' })).toBeHidden();

  await menu.click();
  const close = page.getByRole('button', { name: 'Close' });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Shipments' })).toBeVisible();

  await nav.getByRole('link', { name: 'Shipments' }).click();
  await expect(page).toHaveURL(/\/shipments$/);
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Shipments' })).toBeHidden();
});

test('no page scrolls sideways at 375 px and none logs an error', async ({ page, request }) => {
  const order = await createOrder(request);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const path of ['/', '/shipments', `/shipments/${order.id}`, '/shipments/new', '/couriers', '/integrations']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await horizontalOverflow(page), `horizontal overflow on ${path}`).toBe(0);
  }
  expect(errors).toEqual([]);
});
