// MH-08 FT1 – E2E of "Cancel booking" in My bookings (MH-08 FE1 + BE1), at desktop and 360 px.
// Same rules as client/test/unit/pages/CancelBooking.test.jsx: cancel asks for confirmation and "Keep it" changes
// nothing; after cancelling, the booking shows as cancelled, an email is sent (PO #41) and its seats are free again
// in Check availability (MH-04).
// Data: every test registers its own hiker and books through the API. E2E_NOW is Mon 2 Nov 2026, 10:00.
// Day: Fri 13 Nov, no seed booking (lunch: 26 seats; dinner: 24 seats). Its lunch is used by no other spec; the
// dinner only for parties of 2 (booking.spec.js). "Keep it" uses the dinner and leaves its party of 2 there; the
// cancel books 20 of the lunch seats and frees them again, so the desktop and phone runs never meet.
import { expectAccessible } from './helpers/axe.js';
import { bookByApi, registerHiker } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const DAY = '2026-11-13';
const DAY_TEXT = 'Fri 13 Nov';
const LUNCH = /^Lunch, 12:00 – 14:00/;

const cancelButton = (item) => item.getByRole('button', { name: 'Cancel booking' });
const dialogOf = (page) => page.getByRole('dialog', { name: 'Cancel this booking?' });

/**
 * Waits for the page's CSS transitions to end. The dialog and its backdrop fade and slide in (Bootstrap, 0.3 s):
 * axe must check the page once it stands still, or on a fast computer it measures half-transparent colours and
 * reports color-contrast.
 */
const animationsDone = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

/** The bookings the server holds for the hiker logged in on `request` (GET /api/bookings). */
async function myBookings(request) {
  const res = await request.get('/api/bookings');
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Subjects of the emails captured for `recipient` (GET /api/test/emails exists only in the E2E server). */
async function emailSubjects(request, recipient) {
  const res = await request.get(`/api/test/emails?recipient=${encodeURIComponent(recipient)}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).map((email) => email.subject);
}

/** Check availability (MH-04) for the lunch of DAY and a party of `people`. */
async function checkLunch(page, people) {
  await page.goto('/availability');
  await page.getByLabel('Date', { exact: true }).fill(DAY);
  const time = page.getByLabel('Time', { exact: true });
  await expect(time).toBeEnabled();
  await time.selectOption(await time.locator('option').filter({ hasText: LUNCH }).first().getAttribute('value'));
  await page.getByLabel('Number of people', { exact: true }).fill(String(people));
  await page.getByRole('button', { name: 'Check', exact: true }).click();
}

test.describe('Cancel a booking', () => {
  test('Cancel asks for confirmation; "Keep it" changes nothing', async ({ page }) => {
    const hiker = await registerHiker(page.request); // logs the page in (same cookies)
    const booking = await bookByApi(page.request, DAY, 'Dinner – 1st turn', 2);

    await page.goto('/my-bookings');
    const item = page.getByRole('listitem').filter({ hasText: DAY_TEXT });
    await cancelButton(item).click();

    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(DAY_TEXT);
    await expect(dialog).toContainText('Dinner – 1st turn, 19:00 – 20:30');
    await expect(dialog).toContainText('2 people');
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await animationsDone(page);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await dialog.getByRole('button', { name: 'Keep it' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(cancelButton(item)).toBeFocused();
    await expect(item).not.toContainText('Cancelled');
    await expect(item.getByRole('link', { name: 'Change' })).toBeVisible();
    // Nothing changed on the server either: still confirmed, and only the confirmation email.
    expect((await myBookings(page.request)).find((b) => b.id === booking.id).status).toBe('confirmed');
    expect(await emailSubjects(page.request, hiker.email)).toEqual(['Your booking at the mountain hut is confirmed']);

    // Escape closes it the same way.
    await cancelButton(item).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(item).not.toContainText('Cancelled');
  });

  test('after cancelling, the booking shows as cancelled and the seats are free in Check availability', async ({
    page,
  }) => {
    const hiker = await registerHiker(page.request);
    await bookByApi(page.request, DAY, 'Lunch', 20); // the lunch has 26 seats: 6 are left

    await checkLunch(page, 10);
    await expect(page.getByRole('status').filter({ hasText: /Not available/ })).toBeVisible();

    await page.goto('/my-bookings');
    const item = page.getByRole('listitem').filter({ hasText: DAY_TEXT });
    await cancelButton(item).click();
    await dialogOf(page).getByRole('button', { name: 'Yes, cancel booking' }).click();

    await expect(dialogOf(page)).toHaveCount(0);
    const message = page.getByRole('status').filter({ hasText: 'Booking cancelled. We sent you an email.' });
    await expect(message).toBeFocused();
    await expect(item).toContainText('Cancelled');
    await expect(cancelButton(item)).toHaveCount(0);
    await expect(item.getByRole('link', { name: 'Change' })).toHaveCount(0);
    await animationsDone(page);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // Saved by the server: a reload still shows it cancelled; the hiker got the cancellation email.
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: DAY_TEXT })).toContainText('Cancelled');
    expect(await emailSubjects(page.request, hiker.email)).toContain(
      'Your booking at the mountain hut has been cancelled',
    );

    // Its 20 seats are free again: the same party of 10 now fits.
    await checkLunch(page, 10);
    await expect(page.getByRole('status').filter({ hasText: /Available/ })).toBeVisible();
  });
});
