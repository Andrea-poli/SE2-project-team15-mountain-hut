// MH-09 – Repeat a weekly schedule ("Copy week" in the staff week view), at desktop and 360 px.
// From the story, the PO answer #45 (a copy replaces a schedule without bookings, never one with bookings) and
// docs/openapi.yaml (copyWeek). Same behaviour as client/test/unit/pages/CopyWeek.test.jsx.
//   E1 The employee copies the current week into a week with no slots: the page shows that week with a summary,
//      and its slots are the ones of the current week, same times, labels and tables.
//   E2 Copying onto a week with bookings still to come is refused: the dialog says so and nothing changes.
//
// Data: the demo seed on E2E_NOW (Mon 2 Nov 2026, 10:00): slots every day from 7 days ago to 14 days ahead
// (16 Nov), bookings from 3 days ago to 3 days ahead (so the current week has bookings still to come);
// employee@example.com / employeepass. E1 copies into weeks after the seeded days, one per project so the desktop
// and phone runs (same database) never meet: 23–29 Nov (desktop), 30 Nov – 6 Dec (phone). The source is read
// from the API before the copy, so slots added to the current week by other specs are copied too.
import { expectAccessible } from './helpers/axe.js';
import { expect, test } from './helpers/clock.js';
import { expectNoHorizontalScroll } from './helpers/layout.js';

const THIS_WEEK = { monday: '2026-11-02', sunday: '2026-11-08', range: '2 – 8 Nov 2026' };
// E1's target week and how many times "Next week" is pressed in the dialog (it starts on 9 Nov).
const TARGET_BY_PROJECT = {
  desktop: { monday: '2026-11-23', sunday: '2026-11-29', range: '23 – 29 Nov 2026', nextClicks: 2, shiftDays: 21 },
  phone: { monday: '2026-11-30', sunday: '2026-12-06', range: '30 Nov – 6 Dec 2026', nextClicks: 3, shiftDays: 28 },
};

const dialog = (page) => page.getByRole('dialog', { name: 'Copy week' });

async function logIn(page) {
  await page.goto(`/login?next=${encodeURIComponent('/staff/slots')}`);
  await page.getByLabel('Email', { exact: true }).fill('employee@example.com');
  await page.getByLabel('Password', { exact: true }).fill('employeepass');
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Slots of the week' })).toBeVisible();
}

/** The slots of a date range, read with the employee's session (GET /api/slots). */
async function slotsOf(page, from, to) {
  const res = await page.request.get(`/api/slots?from=${from}&to=${to}`);
  expect(res.ok(), await res.text()).toBe(true);
  return res.json();
}

const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** What a copy keeps of a slot: date (shifted), times, label and tables. */
const copyShape = (slot, shiftDays = 0) => ({
  date: addDays(slot.date, shiftDays),
  startTime: slot.startTime,
  endTime: slot.endTime,
  label: slot.label,
  tables: slot.tables.map(({ name, seats }) => ({ name, seats })),
});

test.describe('Copy week (staff)', () => {
  test.beforeEach(async ({ page }) => logIn(page));

  test('E1: the current week is copied into an empty week, which then shows the same slots and tables', async ({
    page,
  }) => {
    const target = TARGET_BY_PROJECT[test.info().project.name];
    const source = await slotsOf(page, THIS_WEEK.monday, THIS_WEEK.sunday);
    expect(source.length).toBeGreaterThan(0);
    expect(await slotsOf(page, target.monday, target.sunday)).toEqual([]); // nothing to replace

    await page.getByRole('button', { name: 'Copy week' }).click();
    await expect(dialog(page)).toContainText(`Copy the slots of ${THIS_WEEK.range}, with their tables, into:`);
    for (let i = 0; i < target.nextClicks; i++) await dialog(page).getByRole('button', { name: 'Next week' }).click();
    await expect(dialog(page).getByText(target.range)).toBeVisible();
    await expect(dialog(page)).not.toContainText(/will be replaced/);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await dialog(page).getByRole('button', { name: 'Copy slots' }).click();

    await expect(dialog(page)).toBeHidden();
    const summary = page.getByRole('status').filter({ hasText: /copied/ });
    await expect(summary).toHaveText(`${source.length} slots copied.`);
    await expect(page.getByText(target.range)).toBeVisible(); // the page now shows the target week
    expect(new URL(page.url()).searchParams.get('week')).toBe(target.monday);

    // The copies, as the server keeps them: same weekday, times, label and tables.
    const copies = await slotsOf(page, target.monday, target.sunday);
    expect(copies.map((slot) => copyShape(slot))).toEqual(source.map((slot) => copyShape(slot, target.shiftDays)));

    // And on screen: Monday's lunch opens with its tables.
    const monday = page.getByRole('region').filter({ has: page.getByRole('heading', { name: /^Mon/ }) });
    const lunch = monday.getByRole('button', { name: /Lunch/ });
    await lunch.click();
    await expect(lunch).toHaveAttribute('aria-expanded', 'true');
    const lunchTables = copies.find((slot) => slot.date === target.monday && slot.label === 'Lunch').tables;
    for (const table of lunchTables) {
      await expect(monday.getByText(new RegExp(`${table.name}\\D+${table.seats} seats?`))).toBeVisible();
    }
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test('E2: copying onto a week with bookings still to come is refused, and nothing changes', async ({ page }) => {
    const before = await slotsOf(page, THIS_WEEK.monday, THIS_WEEK.sunday);

    // From next week's view, back to the current week (the dialog skips the shown week).
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByText('9 – 15 Nov 2026')).toBeVisible();
    await page.getByRole('button', { name: 'Copy week' }).click();
    await dialog(page).getByRole('button', { name: 'Previous week' }).click();
    await expect(dialog(page).getByText(THIS_WEEK.range)).toBeVisible();

    await dialog(page).getByRole('button', { name: 'Copy slots' }).click();

    const message = dialog(page).getByText('This week has bookings: choose another week.');
    await expect(message).toBeVisible();
    await expect(message).toBeFocused();
    await expect(dialog(page).getByRole('button', { name: 'Copy slots' })).toBeDisabled();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await slotsOf(page, THIS_WEEK.monday, THIS_WEEK.sunday)).toEqual(before);
  });
});
