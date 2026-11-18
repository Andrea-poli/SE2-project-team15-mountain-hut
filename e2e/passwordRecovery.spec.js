// MH-07 – forced password change and password recovery by email, at desktop and 360 px (playwright.config.js
// projects). From the story ("the password is randomly generated… They will be forced to change the password on
// their next login, in any case the hiker can recover their password via email"), PO #44 (link valid 24 h) and
// docs/openapi.yaml (PUT /api/auth/password, POST /api/auth/password-reset, …/confirm, User.mustChangePassword).
//
// CONTRACT
//   E5 A hiker created by staff logs in with the generated password, is sent to Change password and cannot open
//      other pages until they choose their own; then they use the site, and the generated password no longer works.
//   E6 Forgot password → the emailed link (read from the captured mailbox) → a new password → log in with it; the
//      old password no longer works; the same link a second time is not valid any more.
//   E5b/E6b/E6c On these three forms, after an error, fixing the fields and clicking the button once sends the
//      form (as on the Log in page).
//
// Data: the demo seed on E2E_NOW (Mon 2 Nov 2026, 10:00), employee@example.com / employeepass; the E2E server
// captures the emails (GET /api/test/emails?recipient=, shared mailbox: every test uses a new random email).
// E5 and E5b book 2 seats each of the "Dinner – 1st turn" of 15 Nov (24 seats; 8 in all with the two runs): no
// other spec books that Dinner (others: Dinner 6, 7, 8, 11, 14 staffReservation; 12 requirements and
// changeBooking; 13 booking; 16 confirmationEmail). E6 and E6b book nothing.
// The link in the email starts with PUBLIC_URL (default http://localhost:5173, not set for the E2E client on
// 5174): the test opens its path and query on the E2E client.
import { randomUUID } from 'node:crypto';
import { expectAccessible } from './helpers/axe.js';
import { registerHiker, slotId } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const STAFF_BOOKING_DAY = '2026-11-15';
const NEW_PASSWORD = 'my-own-secret-pw';

const heading = (page, name) => page.getByRole('heading', { level: 1, name });

async function expectPageOk(page) {
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
}

/** Logs in through the login page (the page is a guest). */
async function logInOnPage(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
}

/** Status of an API login with a new, empty context (no cookie of the page). */
async function apiLogin(playwright, baseURL, email, password) {
  const context = await playwright.request.newContext({ baseURL });
  try {
    const res = await context.post('/api/auth/login', { data: { email, password } });
    return { status: res.status(), body: res.ok() ? await res.json() : null };
  } finally {
    await context.dispose();
  }
}

/**
 * The employee creates a hiker with a booking (POST /api/staff/bookings, newHiker), in a context of their own:
 * returns the hiker's email and the generated password.
 */
async function hikerCreatedByStaff(playwright, baseURL) {
  const email = `staff-made-${randomUUID()}@example.com`;
  const staff = await playwright.request.newContext({ baseURL });
  try {
    const login = await staff.post('/api/auth/login', { data: { email: 'employee@example.com', password: 'employeepass' } });
    expect(login.ok(), await login.text()).toBe(true);
    const res = await staff.post('/api/staff/bookings', {
      data: {
        newHiker: { firstName: 'Paolo', lastName: 'Neri', email, phone: '+393335551234' },
        slotId: await slotId(staff, STAFF_BOOKING_DAY, 'Dinner – 1st turn'),
        partySize: 2,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const { generatedPassword } = await res.json();
    expect(generatedPassword).toEqual(expect.any(String));
    return { email, generated: generatedPassword };
  } finally {
    await staff.dispose();
  }
}

/** Path and query of the last reset link emailed to `email` (opened on the E2E client, see above). */
async function resetLinkSentTo(request, email) {
  const res = await request.get(`/api/test/emails?recipient=${encodeURIComponent(email)}`);
  expect(res.ok()).toBe(true);
  const emails = await res.json();
  expect(emails.length, `emails to ${email}`).toBeGreaterThan(0);
  const { text } = emails.at(-1);
  const link = text.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  expect(link, text).toBeDefined();
  const { pathname, search } = new URL(link);
  expect(new URLSearchParams(search).get('token')).toBeTruthy();
  return { count: emails.length, path: pathname + search };
}

test.describe('Forced password change and recovery by email', () => {
  test('E5: a hiker created by staff must change the generated password before using the site', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const { email, generated } = await hikerCreatedByStaff(playwright, baseURL);

    // First login: straight to Change password.
    await logInOnPage(page, email, generated);
    await expect(page).toHaveURL('/change-password');
    await expect(heading(page, 'Change password')).toBeVisible();
    await expect(page).toHaveTitle('Change password – Mountain Hut');
    await expect(page.getByText(/created by the hut staff/i)).toBeVisible();
    await expectPageOk(page);

    // No other page before the change, whether typed in the address bar or chosen in the menu.
    for (const path of ['/book', '/', '/availability']) {
      await page.goto(path);
      await expect(page, path).toHaveURL('/change-password');
      await expect(heading(page, 'Change password')).toBeVisible();
    }

    await page.getByLabel('Password you were given', { exact: true }).fill(generated);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('main').getByRole('button', { name: 'Change password' }).click();

    // Now the site is open.
    await expect(page).toHaveURL('/');
    await page.goto('/book');
    await expect(heading(page, 'Book a table')).toBeVisible();
    await expect(page).toHaveURL('/book');
    await expectPageOk(page);

    // Only the new password works, and it is not "generated" any more.
    expect((await apiLogin(playwright, baseURL, email, generated)).status).toBe(401);
    const again = await apiLogin(playwright, baseURL, email, NEW_PASSWORD);
    expect(again.status).toBe(200);
    expect(again.body.mustChangePassword ?? false).toBe(false);
  });

  test('E6: forgot password → emailed link → new password → log in; the link works once', async ({
    page,
    request,
    playwright,
    baseURL,
  }) => {
    const hiker = await registerHiker(request, { firstName: 'Lucia', lastName: 'Ferri' }); // its own API context

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL('/forgot-password');
    await expect(heading(page, 'Forgot password')).toBeVisible();
    await expectPageOk(page);

    await page.getByLabel('Email', { exact: true }).fill(hiker.email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('status')).toContainText(hiker.email);
    await expectPageOk(page); // the long random email wraps at 360 px

    // The email: one, to the hiker, with the link to the reset page.
    const { count, path: link } = await resetLinkSentTo(request, hiker.email);
    expect(count).toBe(1);

    await page.goto(link);
    await expect(heading(page, 'Choose a new password')).toBeVisible();
    await expectPageOk(page);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save the new password' }).click();
    await expect(page.getByRole('status')).toContainText(/password has been changed/i);
    await expectPageOk(page);

    // Log in with the new password, from the link of the page.
    await page.getByRole('main').getByRole('link', { name: 'Log in' }).click();
    await expect(heading(page, 'Log in')).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(hiker.email);
    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL('/');
    const me = await page.request.get('/api/auth/me'); // the name is in the collapsed menu at 360 px
    expect(me.status()).toBe(200);
    expect((await me.json()).email).toBe(hiker.email);
    expect((await apiLogin(playwright, baseURL, hiker.email, hiker.password)).status).toBe(401);

    // The same link again: not valid, with a way to ask for a new one.
    await page.goto(link);
    await page.getByLabel('New password', { exact: true }).fill('another-password');
    await page.getByLabel('Confirm new password', { exact: true }).fill('another-password');
    await page.getByRole('button', { name: 'Save the new password' }).click();
    await expect(page.getByRole('alert')).toContainText(/not valid/i);
    await expect(page.getByRole('link', { name: /new link/i })).toHaveAttribute('href', '/forgot-password');
    await expectPageOk(page);
    expect((await apiLogin(playwright, baseURL, hiker.email, 'another-password')).status).toBe(401);
  });

  // A user who first sends a form with an error, then fixes the fields and clicks the button once: the click must
  // send the form (on Log in it does). Leaving the last field removes its error message, so the button must not
  // move away under the pointer before the click ends.
  test('E5b: after an error, one click on "Change password" is enough', async ({ page, playwright, baseURL }) => {
    const { email, generated } = await hikerCreatedByStaff(playwright, baseURL);
    await logInOnPage(page, email, generated);
    await expect(heading(page, 'Change password')).toBeVisible();

    const submit = page.getByRole('main').getByRole('button', { name: 'Change password' });
    await submit.click();
    await expect(page.getByLabel('Password you were given', { exact: true })).toBeFocused();
    await expectPageOk(page); // the page with its errors

    await page.getByLabel('Password you were given', { exact: true }).fill(generated);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await submit.click();
    await expect(page).toHaveURL('/');
  });

  test('E6b: after an error, one click on "Send the link" is enough', async ({ page, request }) => {
    const hiker = await registerHiker(request);

    await page.goto('/forgot-password');
    const send = page.getByRole('button', { name: 'Send the link' });
    await send.click();
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await expectPageOk(page);
    await page.getByLabel('Email', { exact: true }).fill(hiker.email);
    await send.click();
    await expect(page.getByRole('status')).toContainText(hiker.email);
  });

  test('E6c: after an error, one click on "Save the new password" is enough', async ({ page, request }) => {
    const hiker = await registerHiker(request);
    expect((await request.post('/api/auth/password-reset', { data: { email: hiker.email } })).status()).toBe(202);

    const { path: link } = await resetLinkSentTo(request, hiker.email);
    await page.goto(link);
    const save = page.getByRole('button', { name: 'Save the new password' });
    await save.click();
    await expect(page.getByLabel('New password', { exact: true })).toBeFocused();
    await expectPageOk(page);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await save.click();
    await expect(page.getByRole('status')).toContainText(/password has been changed/i);
  });
});
