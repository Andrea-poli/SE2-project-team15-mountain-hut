// MH-04 FT1 – E2E of the Check availability page (as a guest), at desktop and 360 px (playwright.config.js).
// Same contract as client/test/unit/pages/CheckAvailabilityPage.test.jsx (C1–C9).
//
// Data: the E2E server starts on an EMPTY database (server/src/index.js deletes it in e2e). The slots needed
// come from the demo seed (U10, PR #8): the E2E start must load it (see the PR). Until that, MH-04 BE1/FE1
// and MH-01 BE2 exist, these tests fail: expected. Seed facts used (seed.js, today = E2E_NOW = Mon 2 Nov 2026):
//   tomorrow, "Dinner – 1st turn" 19:00–20:30, tables 2+4+4+6+8 (24 seats), already booked 10 + 2 → 12 free.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const TOMORROW = '2026-11-03';
const DINNER = /^Dinner – 1st turn, 19:00 – 20:30/;

async function choose(page, { date = TOMORROW, time = DINNER, people }) {
  await page.getByLabel('Date', { exact: true }).fill(date);
  const timeSelect = page.getByLabel('Time', { exact: true });
  await expect(timeSelect).toBeEnabled();
  const option = timeSelect.locator('option').filter({ hasText: time });
  await timeSelect.selectOption(await option.first().getAttribute('value'));
  await page.getByLabel('Number of people', { exact: true }).fill(String(people));
}

test.describe('Check availability (guest)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/availability');
    await expect(page.getByRole('heading', { level: 1, name: 'Check availability' })).toBeVisible();
  });

  test('is public, accessible and has no horizontal scroll', async ({ page }) => {
    await expect(page).toHaveTitle('Check availability – Mountain Hut');
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('a party that fits: available, with the seat split and a prefilled booking link', async ({ page }) => {
    await choose(page, { people: 4 });
    await page.getByRole('button', { name: 'Check', exact: true }).click();

    const result = page.getByRole('status').filter({ hasText: /Available/ });
    await expect(result).toBeVisible();
    await expect(result).toContainText(/\d+( \+ \d+)* seats/);
    await expect(page.getByText(/\bT\d\b/)).toHaveCount(0); // seat split, never table names

    const link = page.getByRole('link', { name: 'Book this table' });
    const href = new URL(await link.getAttribute('href'), 'http://x');
    expect(href.pathname).toBe('/book');
    expect(href.searchParams.get('date')).toBe(TOMORROW);
    expect(href.searchParams.get('partySize')).toBe('4');

    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('a party bigger than the free seats: not available, no link, no alternatives', async ({ page }) => {
    await choose(page, { people: 40 });
    await page.getByRole('button', { name: 'Check', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: /Not available/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book this table' })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('"Book this table" leads a guest to log in, then to the prefilled Book page', async ({ page }) => {
    await choose(page, { people: 2 });
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByRole('link', { name: 'Book this table' }).click();

    // /book is for hikers: a guest goes through the login page, which keeps the way back (?next=).
    await expect(page).toHaveURL(/\/login\?next=%2Fbook%3F/);
  });
});
