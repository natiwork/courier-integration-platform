import { expect, test, type Page } from '@playwright/test';

// The table keeps the previous rows (dimmed) while it reloads, so wait until every row matches, not just one.
async function expectEveryRow(page: Page, check: (text: string) => boolean) {
  const rows = page.locator('table tbody tr');
  await expect
    .poll(async () => {
      const texts = await rows.allInnerTexts();
      return texts.length > 0 && texts.every(check);
    })
    .toBe(true);
}

test('search and the status filter update the URL and the rows', async ({ page }) => {
  await page.goto('/shipments');
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  // The top bar has a global search too; this is the list's own filter.
  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill('Berlin');
  await expect(page).toHaveURL(/[?&]search=Berlin/);
  await expectEveryRow(page, (text) => text.includes('Berlin'));

  await page.getByLabel('Status').selectOption('DELIVERED');
  await expect(page).toHaveURL(/status=DELIVERED/);
  await expect(page).toHaveURL(/search=Berlin/);
  await expectEveryRow(page, (text) => text.includes('Berlin') && text.includes('Delivered'));

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/shipments$/);
  await expect(search).toHaveValue('');
});
