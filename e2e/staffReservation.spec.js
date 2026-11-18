// MH-07 – Reserve for a hiker (staff), at desktop and 360 px (playwright.config.js projects).
// Same contract as client/test/unit/pages/StaffReservationPage.test.jsx (R1–R11): an employee books for a
// temporary hiker (quick entry, PO #5) or for a new full hiker, whose generated password is shown once (PO #36)
// and works for the first login, which asks for a change (mustChangePassword).
// Needs the MH-07 backend (GET /api/staff/hikers, POST /api/staff/bookings).
//
// Data: the demo seed on E2E_NOW (Mon 2 Nov 2026, 10:00): every day a Lunch 12:00–14:00 (26 seats) and a
// "Dinner – 1st turn" 19:00–20:30 (24 seats); employee@example.com / employeepass. The seed has bookings only
// up to day 3 (5 Nov); 6–16 Nov are empty and shared with the other specs, which book these slots:
//   Lunch 6, 7, 8 (refused), 9/10, 11/12, 14, 15, 16 (booking, confirmationEmail) · Dinner 12 (requirements),
//   13 (booking), 16 (confirmationEmail).
// E1 needs a whole slot free: the Dinner of 7 Nov in the desktop run and of 8 Nov in the phone run, booked by no
// other spec, so each run starts from an empty slot. The new hikers of E2 dine on 14 Nov (only its Lunch is
// used elsewhere; E2 needs no empty slot, just 2 free seats in each run).
// E3 books for the seeded Marco Rossi (+393401234567, no booking after 5 Nov): one booking per hiker per slot,
// so each run takes its own Dinner, 6 Nov (desktop) and 11 Nov (phone), booked by no other spec.
// E4 needs a slot starting in LESS than 2 hours (today's Lunch, at 12:00, is exactly 2 h away: hikers can still
// book it). The employee creates one through POST /api/slots, today before the Lunch, one per run so they do
// not overlap: 11:00–11:30 (desktop), 11:30–12:00 (phone, adjacent to the Lunch: allowed). No other spec
// creates slots today (slots.spec creates on 4 Nov).
import { randomUUID } from 'node:crypto';
import { expectAccessible } from './helpers/axe.js';
import { fillForm, registerHiker } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const DINNER = 'Dinner – 1st turn, 19:00 – 20:30';
const SOON_SLOT_BY_PROJECT = {
  desktop: { startTime: '11:00', endTime: '11:30' },
  phone: { startTime: '11:30', endTime: '12:00' },
};
const DINNER_SEATS = 24;
const DAY_BY_PROJECT = { desktop: '2026-11-07', phone: '2026-11-08' };
const NEW_HIKER_DAY = '2026-11-14';
const EXISTING_HIKER_DAY_BY_PROJECT = { desktop: '2026-11-06', phone: '2026-11-11' };
const TODAY = '2026-11-02';

const confirmed = (page) => page.getByRole('heading', { level: 1, name: 'Reservation confirmed' });
const passwordRegion = (page) => page.getByRole('region', { name: /password/i });

async function logInAsEmployee(page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'employee@example.com', password: 'employeepass' },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

async function openReservationPage(page) {
  await page.goto('/staff/bookings/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New reservation' })).toBeVisible();
  await expect(page).toHaveTitle('New reservation – Mountain Hut');
}

/**
 * Confirms the reservation and waits for a still confirmation page. The mouse stays where "Confirm reservation"
 * was, and a button of the confirmation ("Back to slots", "Copy password") can appear under it: axe would then
 * read its colours halfway through the 0.15 s hover transition (e.g. 2.97:1) and fail at random. So the mouse
 * leaves the page and the test waits until no CSS transition is running.
 */
async function confirmReservation(page) {
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(confirmed(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

/** Check availability (MH-04) for `people` in the dinner of `date`: true when "Available". */
async function isAvailable(page, date, people) {
  await page.goto('/availability');
  await fillForm(page, { date, time: DINNER, partySize: people });
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const result = page.getByRole('status').filter({ hasText: /Available|Not available/ });
  await expect(result).toBeVisible();
  return !/Not available/.test(await result.textContent());
}

test.describe('Reserve for a hiker', () => {
  test.beforeEach(async ({ page }) => logInAsEmployee(page));

  test('E1: quick entry for a temporary hiker; Check availability then shows fewer free seats', async ({ page }) => {
    const day = DAY_BY_PROJECT[test.info().project.name];
    expect(await isAvailable(page, day, DINNER_SEATS)).toBe(true); // the whole slot is free

    await openReservationPage(page);
    await page.getByRole('radio', { name: 'Quick entry' }).check();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await page.getByLabel('First name', { exact: true }).fill('Giulia');
    await page.getByLabel(/^Mobile number/).fill('333 765 4321');
    await fillForm(page, { date: day, time: DINNER, partySize: 4 });
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await confirmReservation(page);
    const main = page.getByRole('main');
    await expect(main).toContainText('Giulia');
    await expect(main).toContainText(/temporary/i);
    await expect(main).toContainText('4 people');
    await expect(main).toContainText(/\d+( \+ \d+)* seats/);
    await expect(main.getByText(/\bT\d\b/)).toHaveCount(0); // seat split, never table names
    await expect(passwordRegion(page)).toHaveCount(0);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // The 4 seats are taken: the whole slot no longer fits, the rest still does.
    expect(await isAvailable(page, day, DINNER_SEATS)).toBe(false);
    expect(await isAvailable(page, day, DINNER_SEATS - 4)).toBe(true);
  });

  test('E2: a new hiker gets a generated password, shown once, that works for the first login', async ({
    page,
    context,
    playwright,
    baseURL,
  }) => {
    const email = `new-hiker-${randomUUID()}@example.com`;
    await openReservationPage(page);
    await page.getByRole('radio', { name: 'New hiker' }).check();
    await expect(page.getByLabel(/password/i)).toHaveCount(0); // staff never choose it
    await page.getByLabel('First name', { exact: true }).fill('Paolo');
    await page.getByLabel('Last name', { exact: true }).fill('Neri');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mobile number', { exact: true }).fill('333 555 1234');
    await fillForm(page, { date: NEW_HIKER_DAY, time: DINNER, partySize: 2 });
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await confirmReservation(page);
    await expect(page.getByRole('main')).toContainText('Paolo Neri');

    const region = passwordRegion(page);
    await expect(region).toBeVisible();
    const password = (await region.getByText(/^\S{8,}$/).textContent()).trim();
    expect(password.length).toBeGreaterThanOrEqual(8);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await region.getByRole('button', { name: 'Copy password' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();

    // Shown once: after a reload (or a new reservation) it is nowhere.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'New reservation' })).toBeVisible();
    await expect(page.getByText(password)).toHaveCount(0);

    // The hiker can log in with it, and must change it (PO #36).
    const hikerRequest = await playwright.request.newContext({ baseURL });
    try {
      const res = await hikerRequest.post('/api/auth/login', { data: { email, password } });
      expect(res.status(), await res.text()).toBe(200);
      expect(await res.json()).toMatchObject({ email, role: 'hiker', mustChangePassword: true });
    } finally {
      await hikerRequest.dispose();
    }
  });

  test('E3: an existing hiker, found by phone (typed with spaces) and by part of the name', async ({ page }) => {
    await openReservationPage(page);
    await page.getByRole('radio', { name: 'Existing hiker' }).check();
    const search = page.getByRole('searchbox', { name: 'Search' });
    const marco = page.getByRole('radio', { name: /Marco Rossi/ });

    await search.fill('340 123 4567'); // stored as +393401234567
    await expect(page.getByRole('status').filter({ hasText: '1 hiker found' })).toBeVisible();
    await expect(marco).toBeVisible();

    await search.fill('Ross');
    await expect(marco).toBeVisible();
    await marco.check();
    await expect(page.getByText(/Booking for:?\s*Marco Rossi/)).toBeVisible();
    await fillForm(page, { date: EXISTING_HIKER_DAY_BY_PROJECT[test.info().project.name], time: DINNER, partySize: 3 });
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await confirmReservation(page);
    const main = page.getByRole('main');
    await expect(main).toContainText('Marco Rossi');
    await expect(main).toContainText('marco.rossi@example.com');
    await expect(main).toContainText('3 people');
    await expect(main).not.toContainText(/temporary/i);
    await expect(passwordRegion(page)).toHaveCount(0);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('E4: staff book a slot starting in less than 2 hours (no 2-hour rule); a hiker sees it closed', async ({
    page,
  }) => {
    // A slot of today starting within 2 hours of E2E_NOW (10:00), created by the employee (beforeEach login).
    const { startTime, endTime } = SOON_SLOT_BY_PROJECT[test.info().project.name];
    const created = await page.request.post('/api/slots', {
      data: { date: TODAY, startTime, endTime, label: 'Brunch', tables: [{ name: 'T1', seats: 4 }] },
    });
    expect(created.status(), await created.text()).toBe(201);
    const soon = `Brunch, ${startTime} – ${endTime}`;

    await openReservationPage(page);
    await page.getByRole('radio', { name: 'Quick entry' }).check();
    await page.getByLabel('First name', { exact: true }).fill('Tommaso');
    await page.getByLabel('Date', { exact: true }).fill(TODAY);
    const option = page.getByLabel('Time', { exact: true }).getByRole('option', { name: soon, exact: true });
    await expect(option).toBeEnabled();
    await fillForm(page, { date: TODAY, time: soon, partySize: 2 });
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await confirmReservation(page);
    await expect(page.getByRole('main')).toContainText('Mon 2 Nov');
    await expect(page.getByRole('main')).toContainText(soon);
    await expectAccessible(page);

    // The same slot for a hiker: closed by the 2-hour rule.
    expect((await page.request.post('/api/auth/logout')).ok()).toBe(true);
    await registerHiker(page.request); // logs the page in as a new hiker
    await page.goto('/book');
    await expect(page.getByRole('heading', { level: 1, name: 'Book a table' })).toBeVisible();
    await page.getByLabel('Date', { exact: true }).fill(TODAY);
    const closed = page.getByLabel('Time', { exact: true }).getByRole('option', { name: `${soon} – booking closed` });
    await expect(closed).toBeDisabled();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });
});
