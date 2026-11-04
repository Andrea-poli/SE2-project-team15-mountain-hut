// MH-02 FT1 – E2E of the staff slot pages (week view + new slot form), at desktop and 360 px.
// Same contract as client/test/unit/pages/StaffSlotsPages.test.jsx (W1–W7, N1–N6).
//
// Data: the E2E server starts on an EMPTY database (server/src/index.js deletes it in e2e); the demo
// seed (U10, PR #8) must be loaded at the E2E start (see the PR) for the accounts and slots below.
// Until MH-02 BE1/BE2/FE1/FE2 exist, these tests fail: expected. Seed facts used
// (seed.js, today = E2E_NOW = Mon 2 Nov 2026): employee@example.com / employeepass, hiker@example.com /
// hikerpass; every day has "Lunch" 12:00–14:00 and "Dinner – 1st turn" 19:00–20:30.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

async function logIn(page, email, password, next = '/staff/slots') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
}

test.describe('Staff slots (employee)', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, 'employee@example.com', 'employeepass');
    await expect(page.getByRole('heading', { level: 1, name: 'Slots of the week' })).toBeVisible();
  });

  test('the week view shows 7 days, today marked, slots open in place; accessible', async ({ page }) => {
    await expect(page.getByRole('region')).toHaveCount(7);
    const today = page.locator('[aria-current="date"]');
    await expect(today).toHaveCount(1);
    await expect(today.getByRole('heading')).toContainText('Mon 2 Nov');

    const dinner = today.getByRole('button', { name: /Dinner – 1st turn/ });
    await dinner.click();
    await expect(dinner).toHaveAttribute('aria-expanded', 'true');
    await expect(today.getByText(/\d+ seats/).first()).toBeVisible();

    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('creates a slot with the tables copied from another one', async ({ page }, testInfo) => {
    // Wednesday's own "Add slot" (W6): the form opens with that date already filled in.
    const wednesday = page.getByRole('region').filter({ has: page.getByRole('heading', { name: /Wed 4 Nov/ }) });
    await wednesday.getByRole('link', { name: /Add slot/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New slot' })).toBeVisible();
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-11-04');

    // The E2E database is shared by the desktop and phone runs: each run creates its slot on its own
    // free afternoon hour (15:00 desktop, 16:00 phone), so the second run is not refused as an overlap.
    const hour = 15 + (testInfo.project.name === 'phone' ? 1 : 0);
    await page.getByLabel('Date', { exact: true }).fill('2026-11-04');
    await page.getByLabel('Start time', { exact: true }).fill(`${hour}:00`);
    await page.getByLabel('End time', { exact: true }).fill(`${hour}:45`);
    await page.getByLabel('Label', { exact: true }).fill('Afternoon tea');
    const copy = page.getByLabel('Copy tables from', { exact: true });
    const lunch = copy.locator('option').filter({ hasText: /Lunch/ }).first();
    await copy.selectOption(await lunch.getAttribute('value'));
    await expect(page.getByLabel('Table name', { exact: true }).first()).not.toHaveValue('');
    await expect(page.getByText(/Total capacity: \d+ seats/)).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Create slot', exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/slots(\?|$)/);
  });

  test('a slot overlapping an existing one is refused', async ({ page }) => {
    await page.goto('/staff/slots/new');
    await page.getByLabel('Date', { exact: true }).fill('2026-11-04');
    await page.getByLabel('Start time', { exact: true }).fill('13:00'); // overlaps Lunch 12:00–14:00
    await page.getByLabel('End time', { exact: true }).fill('15:00');
    await page.getByLabel('Label', { exact: true }).fill('Overlap');
    await page.getByLabel('Table name', { exact: true }).first().fill('T1');
    await page.getByLabel('Seats', { exact: true }).first().fill('4');
    await page.getByRole('button', { name: 'Create slot', exact: true }).click();

    await expect(page.getByText(/Overlaps an existing slot/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'New slot' })).toBeVisible();
  });
});

test('a hiker cannot open the staff pages', async ({ page }) => {
  await logIn(page, 'hiker@example.com', 'hikerpass', '/');
  await expect(page).toHaveURL(/\/$/); // logged in: the login page has sent the hiker on
  await page.goto('/staff/slots');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not available' })).toBeVisible();
});
