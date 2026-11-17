// MH-08 BT1 – integration tests of the cancel booking API, written from the story and docs/openapi.yaml.
// (team rule: tests come from the contract, not from the code).
//
// POST /api/bookings/{id}/cancel – cancel a booking (owner only)
// Contract (docs/openapi.yaml, cancelBooking) and the MH-08 clarification (PO issue #8, any time):
//   • Owner cancels a booking -> 200, status becomes 'cancelled', tables becomes []
//   • Seats freed: availability for the same party becomes available again
//   • Same hiker can book the slot again (unique index applies to confirmed only)
//   • Allowed any time, also after the slot started (no time limit, PO issue #8)
//   • Already cancelled -> 409 'This booking is already cancelled'
//   • Another hiker's booking -> 404 'Booking not found' (404 for staff too: no 403)
//   • Unknown id -> 404 'Booking not found'
//   • Id 'abc' or 0 -> 400 'id must be a positive integer'
//   • Guest (not logged in) -> 401 'Not logged in'
//   • Email: exactly one after cancel, none after refused cancel
//   • GET /api/bookings/{id} after cancel shows status cancelled
//   • Cancelled booking not counted in other hikers' availability
//
// Real app, real SQLite (temporary DB from setupTestDb.js), real sessions; data created through DAOs;
// clock fixed. No unit tests of invented service functions: focused integration tests satisfy BT1.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { setNow } from '../../src/clock.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
useFixedClock(`${TODAY}T10:00`);

const app = createApp();
const PASSWORD = 'mountain-pass-123';

// ---------- data helpers ----------

async function clearDb() {
  const db = await getDb();
  for (const table of ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/** A new user of `role`, logged in: the agent keeps the session cookie. */
async function loggedIn(role = 'hiker') {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email, passwordHash: await hashPassword(PASSWORD), firstName: 'Hannah', lastName: 'Tester', role,
    phone: '+393334445566',
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return { agent, user: { ...user, email } };
}

/** Creates a slot with its tables; seats = list of table sizes, e.g. [4, 4, 6]. */
async function createSlot({ date = TOMORROW, startTime = '19:00', endTime = '20:30', label = 'Dinner', status = 'open',
  seats = [4, 4, 6] } = {}) {
  const db = await getDb();
  return slotDao.create(db, {
    date, startTime, endTime, label, status, tables: seats.map((n, i) => ({ name: `T${i + 1}`, seats: n })),
  });
}

const book = (agent, slotId, partySize) => agent.post('/api/bookings')
  .send({ slotId, partySize });

/** Books through the API and fails the test at once if the booking itself is refused (MH-01 rules). */
async function booked(agent, slotId, partySize) {
  const res = await book(agent, slotId, partySize);
  expect(res.status, 'booking set up by the test').toBe(201);
  return res.body;
}

const cancel = (agent, id) => agent.post(`/api/bookings/${id}/cancel`);

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

async function clearEmails() {
  await request(app).delete('/api/test/emails');
}

async function getEmails(recipient) {
  const res = await request(app).get(`/api/test/emails?recipient=${recipient}`);
  return res.body;
}

beforeEach(clearDb);

// ---------- POST /api/bookings/{id}/cancel ----------

describe('POST /api/bookings/{id}/cancel', () => {
  it('owner cancels a future booking -> 200, status cancelled, tables []', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });
    const { agent } = await loggedIn();
    const created = await booked(agent, slot.id, 3);

    const res = await cancel(agent, created.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: created.id,
      status: 'cancelled',
      tables: [],
    }));
    expect(res.body.partySize).toBe(3); // unchanged
  });

  it('seats are freed and another hiker can book them', async () => {
    // Slot with a single 4-seat table, fully booked by one hiker
    const slot = await createSlot({ seats: [4] });
    const first = await loggedIn();
    const booking1 = await booked(first.agent, slot.id, 4);
    const second = await loggedIn();
    expect((await book(second.agent, slot.id, 4)).status, 'the slot is full before the cancel').toBe(409);

    expect((await cancel(first.agent, booking1.id)).status).toBe(200);

    // Now another hiker can book all 4 seats
    const booking2 = await booked(second.agent, slot.id, 4);
    expect(booking2.status).toBe('confirmed');
    expect(booking2.tables.reduce((sum, t) => sum + t.seats, 0)).toBe(4);
  });

  it('the same hiker can book the slot again after cancelling', async () => {
    const slot = await createSlot({ seats: [4] });
    const { agent } = await loggedIn();
    const first = await booked(agent, slot.id, 2);

    expect((await cancel(agent, first.id)).status).toBe(200);

    // Same hiker books the slot again (cancelled doesn't count toward the unique index)
    const second = await booked(agent, slot.id, 2);
    expect(second.status).toBe('confirmed');
    expect(second.id).not.toBe(first.id);
  });

  it('cancel after the slot started (clock moved past start) -> 200', async () => {
    const slot = await createSlot({ date: TODAY, startTime: '13:00', endTime: '14:00' });
    const { agent } = await loggedIn();
    const booking = await booked(agent, slot.id, 2); // 10:00: 3 h before, so the booking is accepted

    // Move clock past the slot start
    setNow(`${TODAY}T13:30`);

    const res = await cancel(agent, booking.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('already cancelled -> 409', async () => {
    const slot = await createSlot();
    const { agent } = await loggedIn();
    const booking = await booked(agent, slot.id, 2);

    expect((await cancel(agent, booking.id)).status).toBe(200);

    const res = await cancel(agent, booking.id);
    expectError(res, 409, 'This booking is already cancelled');
  });

  it('another hiker\'s booking -> 404 (existence not revealed)', async () => {
    const slot = await createSlot();
    const owner = await loggedIn();
    const booking = await booked(owner.agent, slot.id, 2);

    const other = await loggedIn();
    const res = await cancel(other.agent, booking.id);
    expectError(res, 404, 'Booking not found');
  });

  it('employee -> 404 (not 403: existence not revealed)', async () => {
    const slot = await createSlot();
    const owner = await loggedIn();
    const booking = await booked(owner.agent, slot.id, 2);

    const { agent } = await loggedIn('employee');
    const res = await cancel(agent, booking.id);
    expectError(res, 404, 'Booking not found');
  });

  it('warden -> 404 (not 403: existence not revealed)', async () => {
    const slot = await createSlot();
    const owner = await loggedIn();
    const booking = await booked(owner.agent, slot.id, 2);

    const { agent } = await loggedIn('warden');
    const res = await cancel(agent, booking.id);
    expectError(res, 404, 'Booking not found');
  });

  it('unknown id -> 404', async () => {
    const { agent } = await loggedIn();
    expectError(await agent.post('/api/bookings/999999/cancel'), 404, 'Booking not found');
  });

  it.each(['abc', '0', '-3', '1.5'])('id "%s" -> 400', async (id) => {
    const { agent } = await loggedIn();
    expectError(await agent.post(`/api/bookings/${id}/cancel`), 400,
      'id must be a positive integer');
  });

  it('guest (not logged in) -> 401', async () => {
    expectError(await request(app).post('/api/bookings/1/cancel'), 401);
  });

  it('GET /api/bookings/{id} after cancel shows status cancelled', async () => {
    const slot = await createSlot();
    const { agent } = await loggedIn();
    const booking = await booked(agent, slot.id, 2);

    expect((await cancel(agent, booking.id)).status).toBe(200);

    const res = await agent.get(`/api/bookings/${booking.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.tables).toEqual([]);
  });

  it('exactly one email after cancel', async () => {
    const slot = await createSlot();
    const { agent, user } = await loggedIn();
    const booking = await booked(agent, slot.id, 2);

    await clearEmails(); // the booking's own confirmation
    expect((await cancel(agent, booking.id)).status).toBe(200);

    const emails = await getEmails(user.email);
    expect(emails).toHaveLength(1);
    // The wording is free; the email must say the booking is cancelled (PO issue #41).
    expect(`${emails[0].subject}\n${emails[0].text}`).toMatch(/cancel/i);
  });

  it('no email after refused cancel (already cancelled)', async () => {
    const slot = await createSlot();
    const { agent, user } = await loggedIn();
    const booking = await booked(agent, slot.id, 2);

    expect((await cancel(agent, booking.id)).status).toBe(200);
    await clearEmails();
    expect((await cancel(agent, booking.id)).status).toBe(409); // refused

    const emails = await getEmails(user.email);
    expect(emails).toHaveLength(0);
  });

  it('cancelled booking not counted in another hiker\'s availability', async () => {
    // Slot with 4 seats. First hiker books and cancels. Second hiker should see all 4 available
    const slot = await createSlot({ seats: [4] });
    const first = await loggedIn();
    const booking = await booked(first.agent, slot.id, 4);

    expect((await cancel(first.agent, booking.id)).status).toBe(200);

    // Check availability for the second hiker (same party size)
    const res = await request(app)
      .get(`/api/public/slots/${slot.id}/availability?partySize=4`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.split).toEqual([
      expect.objectContaining({ slotTableId: slot.tables[0].id, seats: 4 }),
    ]);
  });
});
