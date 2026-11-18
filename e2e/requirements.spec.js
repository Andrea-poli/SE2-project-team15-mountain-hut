// MH-05 – Provide party requirements, at desktop and 360 px (playwright.config.js projects).
// The PO example (MH-05 clarifications): three requirements, two with allergies, entered on the Book page,
// shown on the confirmation and listed in the confirmation email (MH-03; captured by the E2E server).
// Data: the demo seed on E2E_NOW (Mon 2 Nov 2026). Day: 12 Nov (dinner, 24 seats), which no other spec uses;
// each project books 7 people with a new hiker, so the two runs fit in the same dinner.
import { expectAccessible } from './helpers/axe.js';
import { confirm, fillForm, registerHiker } from './helpers/booking.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const DINNER = 'Dinner – 1st turn, 19:00 – 20:30';
const DAY = '2026-11-12';
const PO_EXAMPLE = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

const description = (page, n) => page.getByLabel(`Description for requirement ${n}`, { exact: true });
const addRequirement = (page) =>
  page.getByRole('group', { name: /Dietary needs and allergies/ }).getByRole('button', { name: /Add/ }).click();

/** Captured emails sent to `recipient` (GET /api/test/emails exists only in the E2E server). */
async function emailsTo(request, recipient) {
  const res = await request.get(`/api/test/emails?recipient=${encodeURIComponent(recipient)}`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe('Party requirements', () => {
  test('a hiker books with the PO example and sees the requirements on the confirmation', async ({ page }) => {
    const hiker = await registerHiker(page.request); // the page shares the session cookie
    await page.goto('/book');
    await fillForm(page, { date: DAY, time: DINNER, partySize: 7 });

    for (const [i, { hasAllergies, description: text }] of PO_EXAMPLE.entries()) {
      await addRequirement(page);
      await description(page, i + 1).fill(text);
      if (hasAllergies) await page.getByRole('checkbox', { name: /Allergies/ }).nth(i).check();
    }
    await expect(page.getByRole('checkbox', { name: /Allergies/ })).toHaveCount(3);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await confirm(page);
    await expect(page).toHaveURL(/\/bookings\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible();

    const expected = ['Allergies1 vegan, peanut allergy', 'Allergies1 shellfish allergy', 'Diet2 vegetarians'];
    const items = () => page.getByRole('region', { name: 'Dietary needs and allergies' }).getByRole('listitem');
    await expect(items()).toHaveText(expected);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // Saved by the server: a reload reads them back.
    await page.reload();
    await expect(items()).toHaveText(expected);

    // The confirmation email lists them too, the allergies marked for the kitchen.
    const [email] = await emailsTo(page.request, hiker.email);
    expect(email.text).toContain('Party requirements:');
    expect(email.text).toContain('[ALLERGY] 1 vegan, peanut allergy');
    expect(email.text).toContain('[ALLERGY] 1 shellfish allergy');
    expect(email.text).toContain('  - 2 vegetarians');
  });

  test('an empty description is refused next to the field, and nothing is booked', async ({ page }) => {
    const hiker = await registerHiker(page.request);
    await page.goto('/book');
    await fillForm(page, { date: DAY, time: DINNER, partySize: 2 });
    await addRequirement(page);
    await description(page, 1).fill('2 vegetarians');
    await addRequirement(page); // left empty

    await confirm(page);

    await expect(page).toHaveURL(/\/book(\?|$)/); // still the Book page
    await expect(description(page, 2)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Enter a description for requirement 2.')).toBeVisible();
    await expect(description(page, 2)).toBeFocused();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    expect(await emailsTo(page.request, hiker.email)).toEqual([]);
  });
});
