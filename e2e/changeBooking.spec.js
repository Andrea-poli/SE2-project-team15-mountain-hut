// MH-06 FT1 – E2E of My bookings and Change booking (MH-06 FE1/FE2), at desktop and 360 px.
// Same contract as client/test/unit/pages/MyBookingsPages.test.jsx (M1–M6, X1–X6).
// Data: every test registers its own hiker and books through the API, so it never depends on the seed's
// bookings, and the desktop and phone runs never meet (one booking per hiker per slot).
// E2E_NOW is Mon 2 Nov 2026, 10:00. Days: Thu 12 Nov, used by no other spec and by no seed booking, for the
// changes; for "less than 48 h", today's dinner (19:00, 9 h away): no other spec uses it.
import { expectAccessible } from './helpers/axe.js';
import { bookByApi, registerHiker } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const FAR = '2026-11-12';
const TODAY = '2026-11-02';

/** Opens the navbar menu when it is collapsed (phone), then follows the link `name`. */
async function clickNavLink(page, name) {
  const toggle = page.getByRole('button', { name: 'Open menu' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name }).click();
}

test.describe('My bookings and Change booking', () => {
  test('a hiker changes the party size, then the time, of a booking far from the meal', async ({ page }) => {
    await registerHiker(page.request); // logs the page in (same cookies)
    await bookByApi(page.request, FAR, 'Dinner – 1st turn', 2);

    await page.goto('/');
    await clickNavLink(page, 'My bookings');
    await expect(page).toHaveURL('/my-bookings');
    await expect(page).toHaveTitle('My bookings – Mountain Hut');
    const item = page.getByRole('listitem').filter({ hasText: 'Thu 12 Nov' });
    await expect(item).toContainText('Dinner – 1st turn');
    await expect(item).toContainText('2 people');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // Party size 2 → 5
    await item.getByRole('link', { name: 'Change' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Change booking' })).toBeVisible();
    await expect(page.getByLabel('Number of people', { exact: true })).toHaveValue('2');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    await page.getByLabel('Number of people', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/my-bookings$/);
    await expect(page.getByRole('status')).toContainText('Booking changed');
    await expect(item).toContainText('5 people');

    // Time: dinner → lunch of the same day
    await item.getByRole('link', { name: 'Change' }).click();
    await page.getByLabel('Time', { exact: true }).selectOption({ label: 'Lunch, 12:00 – 14:00' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('Booking changed');
    await expect(item).toContainText('Lunch');
    await expect(item).toContainText('12:00 – 14:00');
    await expect(item).toContainText('5 people');
  });

  test('a booking less than 48 h before the meal cannot be changed, and says why', async ({ page }) => {
    await registerHiker(page.request);
    await bookByApi(page.request, TODAY, 'Dinner – 1st turn', 2); // 9 h before the meal

    await page.goto('/my-bookings');
    const item = page.getByRole('listitem').filter({ hasText: 'Mon 2 Nov' });
    await expect(item).toContainText('Changes close 48 hours before the meal');
    await expect(item.getByRole('link', { name: 'Change' })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('a hiker without bookings is offered to book a table', async ({ page }) => {
    await registerHiker(page.request);
    await page.goto('/my-bookings');
    await expect(page.getByText('You have no bookings yet')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Book a table' })).toHaveAttribute('href', '/book');
  });
});
