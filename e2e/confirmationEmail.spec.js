// MH-03 – Receive a booking confirmation, at desktop and 360 px (playwright.config.js projects).
// The E2E server captures the emails in memory (NODE_ENV=e2e); GET /api/test/emails?recipient= reads them back.
// The mailbox is shared by all the tests and never emptied: every test registers a new hiker (random email),
// so filtering by recipient isolates it.
// Days (see booking.spec.js for the seed): 7 Nov (3 seats per project, the only bookings of that day),
// 8 Nov (a refused booking: nothing is saved) and 16 Nov (2 + 2 seats per project): no other test uses them.
import { expectAccessible } from './helpers/axe.js';
import { bookByApi, confirm, fillForm, registerHiker, slotId } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const LUNCH = 'Lunch, 12:00 – 14:00';
const DINNER = 'Dinner – 1st turn, 19:00 – 20:30';
const SUBJECT = 'Your booking at the mountain hut is confirmed';

/** Booking id → reference as in the email, e.g. 7 → "MH-000007". */
const reference = (id) => `MH-${String(id).padStart(6, '0')}`;

/** Captured emails, oldest first: all of them, or only those sent to `recipient`. */
async function emails(request, recipient) {
  const query = recipient ? `?recipient=${encodeURIComponent(recipient)}` : '';
  const res = await request.get(`/api/test/emails${query}`);
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Emails (of the whole mailbox) that mention booking `id`. */
const mentioning = (list, id) => list.filter((e) => new RegExp(`${reference(id)}\\b`).test(e.text));

/** Id of the booking whose confirmation page is open. */
async function bookingIdFromUrl(page) {
  await expect(page).toHaveURL(/\/bookings\/\d+$/);
  return Number(page.url().split('/').pop());
}

const emailLine = (page) => page.getByText(/has been sent to/);

test.describe('Booking confirmation email', () => {
  test('a booking sends one email to the hiker, as the confirmation page says', async ({ page, request }) => {
    const hiker = await registerHiker(request, { firstName: 'Ottavia', lastName: 'Pellegrini' });

    await page.goto('/book');
    await expect(page).toHaveURL('/login?next=%2Fbook');
    await page.getByLabel('Email', { exact: true }).fill(hiker.email);
    await page.getByLabel('Password', { exact: true }).fill(hiker.password);
    await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL('/book');
    await fillForm(page, { date: '2026-11-07', time: LUNCH, partySize: 3 });
    await confirm(page);

    const id = await bookingIdFromUrl(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible();
    await expect(emailLine(page)).toHaveText(`A confirmation email has been sent to ${hiker.email}.`);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page); // the long random email wraps at 360 px

    const sent = await emails(request, hiker.email);
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toBe(hiker.email);
    expect(email.subject).toBe(SUBJECT);
    expect(email.text).toContain(`Booking reference: ${reference(id)}`);
    expect(email.text).toContain('Hello Ottavia Pellegrini,');
    expect(email.text).toContain('Booked by: Ottavia Pellegrini');
    expect(email.text).toMatch(/Date: Saturday,? 7 November 2026\n/); // the comma depends on Node's ICU data
    expect(email.text).toContain(`Time: ${LUNCH}`);
    expect(email.text).toContain('Party size: 3 people');
    expect(email.text).not.toMatch(/\bT\d\b/); // never the table names
    // Nobody else got a copy of this booking.
    expect(mentioning(await emails(request), id)).toHaveLength(1);

    // Reading the booking again does not send it again.
    await page.reload();
    await expect(emailLine(page)).toHaveText(`A confirmation email has been sent to ${hiker.email}.`);
    expect(await emails(request, hiker.email)).toHaveLength(1);
    expect(mentioning(await emails(request), id)).toHaveLength(1);
  });

  test('a booking refused by the server sends no email', async ({ page }) => {
    const hiker = await registerHiker(page.request);
    await page.goto('/book');
    await fillForm(page, { date: '2026-11-08', time: LUNCH, partySize: 30 }); // the lunch has 26 seats

    await confirm(page);
    const time = page.getByLabel('Time', { exact: true });
    await expect(time).toHaveAccessibleDescription(/^Not enough seats available for this party\. Choose another time\./);
    await expect(page).toHaveURL('/book');
    await expect(emailLine(page)).toHaveCount(0);
    expect(await emails(page.request, hiker.email)).toEqual([]);
  });

  test('every booking sends its own email, a second booking of the same slot none', async ({ page }) => {
    const date = '2026-11-16';
    const hiker = await registerHiker(page.request);
    await page.goto('/book');
    await fillForm(page, { date, time: LUNCH, partySize: 2 });
    await confirm(page);
    const lunchId = await bookingIdFromUrl(page);
    await expect(emailLine(page)).toBeVisible();
    const dinner = await bookByApi(page.request, date, 'Dinner – 1st turn', 2);

    let sent = await emails(page.request, hiker.email);
    expect(sent).toHaveLength(2);
    expect(sent.map((e) => e.to)).toEqual([hiker.email, hiker.email]);
    expect(sent[0].text).toContain(`Booking reference: ${reference(lunchId)}`);
    expect(sent[0].text).toContain(`Time: ${LUNCH}`);
    expect(sent[1].text).toContain(`Booking reference: ${reference(dinner.id)}`);
    expect(sent[1].text).toContain(`Time: ${DINNER}`);

    const res = await page.request.post('/api/bookings', {
      data: { slotId: await slotId(page.request, date, 'Lunch'), partySize: 2 },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({ error: 'You already have a booking for this slot' });

    sent = await emails(page.request, hiker.email);
    expect(sent).toHaveLength(2);
    expect(mentioning(sent, lunchId)).toHaveLength(1);
  });
});
