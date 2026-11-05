// Booking helpers shared by the story E2E tests (booking.spec.js, confirmationEmail.spec.js).
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

const PASSWORD = 'mountain-hut-e2e';

/**
 * Registers a new hiker through `request` (page.request or an API context): the session cookie stays there.
 * `fields` overrides the default data (e.g. a name of its own).
 */
export async function registerHiker(request, fields = {}) {
  const hiker = {
    firstName: 'Erika',
    lastName: 'Escursionista',
    email: `hiker-${randomUUID()}@example.com`,
    password: PASSWORD,
    phone: '+393331234567',
    ...fields,
  };
  const res = await request.post('/api/auth/register', { data: hiker });
  expect(res.status(), await res.text()).toBe(201);
  return hiker;
}

/** Id of the slot named `label` (e.g. "Lunch") on `date`, from the public API. */
export async function slotId(request, date, label) {
  const res = await request.get(`/api/public/slots?date=${date}`);
  expect(res.ok()).toBe(true);
  const slot = (await res.json()).find((s) => s.label === label);
  expect(slot, `${label} on ${date}`).toBeDefined();
  return slot.id;
}

/** Books through the API for the hiker logged in on `request`; returns the new booking. */
export async function bookByApi(request, date, label, partySize) {
  const res = await request.post('/api/bookings', { data: { slotId: await slotId(request, date, label), partySize } });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

/** Fills the booking form: the time menu is filled once the slots of the day are there. */
export async function fillForm(page, { date, time, partySize }) {
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Time', { exact: true }).selectOption({ label: time });
  await page.getByLabel('Number of people', { exact: true }).fill(String(partySize));
}

export const confirm = (page) => page.getByRole('button', { name: 'Confirm booking' }).click();
