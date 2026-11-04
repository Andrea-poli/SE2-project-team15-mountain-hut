// MH-04 FT1 – E2E of the Check availability page, at desktop and 360 px (playwright.config.js).
// Same contract as client/test/unit/pages/CheckAvailabilityPage.test.jsx (C1–C9): one page for everyone,
// the action after "Available" depends on the role (C6: hiker → "Book this table", guest → "Log in or
// register to book", staff → nothing).
//
// Data: the E2E server starts on an EMPTY database (server/src/index.js deletes it in e2e). The slots and
// accounts needed come from the demo seed (U10): the E2E start must load it (see PR #14). Until that and
// MH-04 FE1 exist, these tests fail: expected. Seed facts used (seed.js, today = E2E_NOW = Mon 2 Nov 2026):
//   tomorrow, "Dinner – 1st turn" 19:00–20:30, tables 2+4+4+6+8 (24 seats), already booked 10 + 2 → 12 free;
//   hiker@example.com / hikerpass, employee@example.com / employeepass.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const TOMORROW = '2026-11-03';
const DINNER = /^Dinner – 1st turn, 19:00 – 20:30/;
const BOOK_LINK = 'Book this table';
const LOGIN_LINK = 'Log in or register to book';

async function choose(page, { date = TOMORROW, time = DINNER, people }) {
  await page.getByLabel('Date', { exact: true }).fill(date);
  const timeSelect = page.getByLabel('Time', { exact: true });
  await expect(timeSelect).toBeEnabled();
  const option = timeSelect.locator('option').filter({ hasText: time });
  await timeSelect.selectOption(await option.first().getAttribute('value'));
  await page.getByLabel('Number of people', { exact: true }).fill(String(people));
}

async function check(page, people) {
  await choose(page, { people });
  await page.getByRole('button', { name: 'Check', exact: true }).click();
}

async function logIn(page, email, password) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
}

test.describe('Check availability as a guest', () => {
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

  test('a party that fits: available with the seat split, and "log in or register to book"', async ({ page }) => {
    await check(page, 4);

    const result = page.getByRole('status').filter({ hasText: /Available/ });
    await expect(result).toBeVisible();
    await expect(result).toContainText(/\d+( \+ \d+)* seats/);
    await expect(page.getByText(/\bT\d\b/)).toHaveCount(0); // seat split, never table names
    await expect(page.getByRole('link', { name: BOOK_LINK })).toHaveCount(0);
    await expect(page.getByRole('link', { name: LOGIN_LINK })).toBeVisible();

    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('a party bigger than the free seats: not available, no link, no alternatives', async ({ page }) => {
    await check(page, 40);

    await expect(page.getByRole('status').filter({ hasText: /Not available/ })).toBeVisible();
    await expect(page.getByRole('link', { name: BOOK_LINK })).toHaveCount(0);
    await expect(page.getByRole('link', { name: LOGIN_LINK })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('"Log in or register to book" → log in → the Book page, prefilled', async ({ page }) => {
    await check(page, 2);
    await page.getByRole('link', { name: LOGIN_LINK }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fbook%3F/);

    await logIn(page, 'hiker@example.com', 'hikerpass');
    await expect(page).toHaveURL(/\/book\?/);
    await expect(page.getByRole('heading', { level: 1, name: 'Book a table' })).toBeVisible();
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(TOMORROW);
    await expect(page.getByLabel('Number of people', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('Time', { exact: true }).locator('option:checked')).toHaveText(DINNER);
  });
});

test.describe('Check availability as a logged-in user', () => {
  test('a hiker gets "Book this table", opening the prefilled Book page', async ({ page }) => {
    await page.goto('/login?next=%2Favailability');
    await logIn(page, 'hiker@example.com', 'hikerpass');
    await expect(page.getByRole('heading', { level: 1, name: 'Check availability' })).toBeVisible();

    await check(page, 3);
    await expect(page.getByRole('link', { name: LOGIN_LINK })).toHaveCount(0);
    await page.getByRole('link', { name: BOOK_LINK }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Book a table' })).toBeVisible();
    await expect(page.getByLabel('Number of people', { exact: true })).toHaveValue('3');
    await expectAccessible(page);
  });

  test('an employee sees the result but no booking link', async ({ page }) => {
    await page.goto('/login?next=%2Favailability');
    await logIn(page, 'employee@example.com', 'employeepass');
    await expect(page.getByRole('heading', { level: 1, name: 'Check availability' })).toBeVisible();

    await check(page, 2);
    await expect(page.getByRole('status').filter({ hasText: /Available/ })).toBeVisible();
    await expect(page.getByRole('link', { name: BOOK_LINK })).toHaveCount(0);
    await expect(page.getByRole('link', { name: LOGIN_LINK })).toHaveCount(0);
  });
});
