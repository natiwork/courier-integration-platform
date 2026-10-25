import { expect, test } from '@playwright/test';

// The only intercepted request in the suite: a real backend can't be told to fail on demand.
test('a widget that fails to load shows its own error and recovers with Try again', async ({ page }) => {
  // Fails until the test "repairs" the server. (Failing just the first request isn't enough: in development React
  // runs effects twice, and the first request is aborted before it matters.)
  let failing = true;
  let failures = 0;
  // A predicate, not a glob: in a glob "?" is a wildcard, not the start of the query string.
  await page.route((url) => url.pathname === '/api/orders' && url.searchParams.has('limit'), async (route) => {
    if (failing) {
      failures += 1;
      await route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: 'e2e' } },
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');

  const recent = page.getByRole('region', { name: 'Recent orders' });
  await expect(recent.getByRole('heading', { name: "Recent orders couldn't be loaded" })).toBeVisible();
  // Only this widget failed: the others still show their data.
  await expect(page.getByRole('region', { name: 'Orders in the last 30 days' }).getByText(/^\d[\d,]*$/)).toBeVisible();
  expect(failures).toBeGreaterThan(0);

  failing = false;
  await recent.getByRole('button', { name: 'Try again' }).click();
  await expect(recent.locator('table tbody tr').first()).toBeVisible();
  await expect(recent.getByRole('heading', { name: "Recent orders couldn't be loaded" })).toBeHidden();
});
