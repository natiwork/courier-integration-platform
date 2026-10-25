import { expect, test } from '@playwright/test';
import { API_URL } from './support';

// The same formatting as frontend/src/lib/format.ts.
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('en-IE');

test('Overview shows the numbers the API computes', async ({ page, request }) => {
  const stats = (await (await request.get(`${API_URL}/api/stats/overview`)).json()).data;
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const hero = page.locator('section[aria-labelledby="hero-revenue-title"]');
  await expect(hero).toContainText(money.format(stats.last30Days.revenueCents.current / 100));
  const orders = page.getByRole('region', { name: 'Orders in the last 30 days' });
  await expect(orders).toContainText(number.format(stats.last30Days.orders.current));
  await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
});

test('the theme toggle switches to dark and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
});
