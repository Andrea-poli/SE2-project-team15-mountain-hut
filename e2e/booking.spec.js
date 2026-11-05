// MH-01 – Book a table, at desktop and 360 px (playwright.config.js projects).
// Data: the server starts with the demo seed computed on E2E_NOW (Mon 2 Nov 2026, 10:00): every day a Lunch
// 12:00–14:00 (tables 4+4+4+6+8 = 26 seats) and a "Dinner – 1st turn" 19:00–20:30 (24 seats).
// The database is emptied once per run, not between tests, and every test runs twice (desktop, phone):
// - every test registers new hikers, so "one booking per hiker per slot" never gets in the way;
// - the tests use 6–16 Nov, where the seed has no bookings (3 Nov belongs to the MH-04 spec), one day each;
//   the ones that fill a slot take a different day in each project, so the second run finds it empty.
import { expectAccessible } from './helpers/axe.js';
import { bookByApi, confirm, fillForm, registerHiker, slotId } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const LUNCH = 'Lunch, 12:00 – 14:00';
const DINNER = 'Dinner – 1st turn, 19:00 – 20:30';

/** A day of November 2026; `perProject`: the next day in the phone project. */
function day(n, { perProject = false } = {}) {
  const shift = perProject && test.info().project.name === 'phone' ? 1 : 0;
  return `2026-11-${String(n + shift).padStart(2, '0')}`;
}

async function expectConfirmation(page, { date, time, people, seating }) {
  await expect(page).toHaveURL(/\/bookings\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Your table is booked. See you at the hut!');
  const main = page.getByRole('main');
  await expect(main).toContainText(date);
  await expect(main).toContainText(time);
  await expect(main).toContainText(people);
  await expect(main).toContainText(seating);
  await expect(main).not.toContainText(/\bT\d\b/); // never the table names
}

/** Opens the navbar menu when it is collapsed (phone), then follows the link `name`. */
async function clickNavLink(page, name) {
  const toggle = page.getByRole('button', { name: 'Open menu' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name }).click();
}

test.describe('Book a table', () => {
  test('a guest logs in, books a lunch and sees the confirmation', async ({ page, request }) => {
    const hiker = await registerHiker(request); // registered elsewhere: the page is still a guest

    await page.goto('/book');
    await expect(page).toHaveURL('/login?next=%2Fbook');
    await page.getByLabel('Email', { exact: true }).fill(hiker.email);
    await page.getByLabel('Password', { exact: true }).fill(hiker.password);
    await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL('/book');
    await expect(page.getByRole('heading', { level: 1, name: 'Book a table' })).toBeVisible();

    // The navbar entry of a hiker leads to the same page.
    await page.goto('/');
    await clickNavLink(page, 'Book a table');
    await expect(page).toHaveURL('/book');
    await expect(page).toHaveTitle('Book a table – Mountain Hut');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await fillForm(page, { date: day(6), time: LUNCH, partySize: 3 });
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    await confirm(page);

    const confirmation = { date: 'Fri 6 Nov', time: LUNCH, people: '3 people', seating: '3 seats at one table' };
    await expectConfirmation(page, confirmation);
    await expect(page).toHaveTitle('Booking confirmed – Mountain Hut');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await page.reload();
    await expectConfirmation(page, confirmation);
  });

  test('a full slot is listed but cannot be chosen', async ({ page, request }) => {
    const date = day(9, { perProject: true });
    await registerHiker(request);
    await bookByApi(request, date, 'Lunch', 26); // all the lunch seats

    await registerHiker(page.request);
    await page.goto('/book');
    await page.getByLabel('Date', { exact: true }).fill(date);
    const full = page.getByRole('option', { name: `${LUNCH} – full` });
    await expect(full).toBeAttached();
    await expect(full).toBeDisabled();
    await expect(page.getByRole('option', { name: DINNER, exact: true })).toBeEnabled();
  });

  test('seats taken while the form is open: the error is shown under Time', async ({ page, request }) => {
    const date = day(11, { perProject: true });
    await registerHiker(page.request);
    await page.goto('/book');
    await fillForm(page, { date, time: LUNCH, partySize: 20 });

    await registerHiker(request);
    await bookByApi(request, date, 'Lunch', 10); // 16 seats left: not enough for 20
    await confirm(page);

    const time = page.getByLabel('Time', { exact: true });
    await expect(time).toHaveAccessibleDescription(/^Not enough seats available for this party\. Choose another time\./);
    await expect(time).toHaveAttribute('aria-invalid', 'true');
    await expect(time).toBeFocused();
    await expect(page).toHaveURL('/book');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('a hiker cannot book the same slot twice', async ({ page }) => {
    const date = day(13);
    await registerHiker(page.request);
    await page.goto('/book');
    await fillForm(page, { date, time: DINNER, partySize: 2 });
    await confirm(page);
    await expect(page).toHaveURL(/\/bookings\/\d+$/);

    await page.goto('/book');
    await fillForm(page, { date, time: DINNER, partySize: 2 });
    await confirm(page);
    const time = page.getByLabel('Time', { exact: true });
    await expect(time).toHaveAccessibleDescription(/^You already have a booking for this slot\. Choose another time\./);
    await expect(time).toBeFocused();
    await expect(page).toHaveURL('/book');
  });

  test('an empty submit flags every field and focuses Date', async ({ page }) => {
    await registerHiker(page.request);
    await page.goto('/book');
    await confirm(page);

    await expect(page.getByLabel('Date', { exact: true })).toBeFocused();
    for (const [label, message] of [
      ['Date', 'Choose a date.'],
      ['Time', 'Choose a time.'],
      ['Number of people', 'Enter the number of people, at least 1.'],
    ]) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field, label).toHaveAttribute('aria-invalid', 'true');
      await expect(field, label).toHaveAccessibleDescription(new RegExp(`^${message.replaceAll('.', '\\.')}`));
    }
    await expect(page).toHaveURL('/book');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('a prefilled link opens the form ready to book that slot', async ({ page }) => {
    const date = day(14);
    await registerHiker(page.request);
    const id = await slotId(page.request, date, 'Lunch');

    await page.goto(`/book?date=${date}&slotId=${id}&partySize=2`);
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
    await expect(page.getByLabel('Time', { exact: true })).toHaveValue(String(id));
    await expect(page.getByLabel('Number of people', { exact: true })).toHaveValue('2');
    await confirm(page);

    await expectConfirmation(page, { date: 'Sat 14 Nov', time: LUNCH, people: '2 people', seating: '2 seats at one table' });
    const bookingId = page.url().split('/').pop();
    const booking = await (await page.request.get(`/api/bookings/${bookingId}`)).json();
    expect(booking).toMatchObject({ slot: { id, date }, partySize: 2 });
  });

  test("someone else's booking is not shown", async ({ page, request }) => {
    await registerHiker(request);
    const other = await bookByApi(request, day(15), 'Lunch', 2);

    await registerHiker(page.request);
    await page.goto(`/bookings/${other.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Booking not found' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('This booking does not exist or is not yours.');
    await expect(page.getByRole('main')).not.toContainText('Lunch');
    await expectAccessible(page);
  });

  test('staff cannot open the booking page', async ({ page }) => {
    const res = await page.request.post('/api/auth/login', {
      data: { email: 'employee@example.com', password: 'employeepass' },
    });
    expect(res.ok()).toBe(true);
    await page.goto('/book');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not available' })).toBeVisible();
    await expect(page.getByLabel('Date', { exact: true })).toHaveCount(0);
  });
});
