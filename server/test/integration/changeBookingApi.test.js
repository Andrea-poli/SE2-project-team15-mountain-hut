// MH-06 BT2 – integration tests of the change booking API, written from the story and docs/openapi.yaml
// (team rule: tests come from the contract, not from the code). Red until MH-06 BE1/BE2 exist.
// Real app, real SQLite (temporary DB from setupTestDb.js), real sessions; the clock is fixed.
//
//   GET   /api/bookings        hikers only: their own bookings, upcoming first, each with `changeable`
//   PATCH /api/bookings/{id}   owner only: change slot, party size and/or requirements
//
// Rules (PO): a change is allowed only while more than 48 h remain before the booked slot starts; that
// instant itself is refused (#43, PO answer received 18 Nov after the first version of these tests said the
// opposite). A new party size or slot is treated as a new booking in that slot, without the booking's own
// seats, and if it does not fit the booking stays as it was (#38); every change is emailed (#41).
//
// Bookings are made through POST /api/bookings when the MH-01 rules allow it; past bookings and party
// requirements are written through the DAOs, so these tests do not depend on MH-05 BE1.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { setNow } from '../../src/clock.js';
import * as bookingDao from '../../src/dao/bookingDao.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now": Monday 2 Nov 2026, 10:00 in the hut. FAR is well beyond the 48 h window.
const TODAY = '2026-11-02';
const FAR = '2026-11-10';
useFixedClock(`${TODAY}T10:00`);

const app = createApp();
const PASSWORD = 'mountain-pass-123';
const MESSAGES = {
  notFound: 'Booking not found',
  slotNotFound: 'Slot not found',
  window: 'Bookings can be changed up to 48 hours before the slot starts',
  cancelled: 'A cancelled booking cannot be changed',
  nothing: 'Nothing to change',
  closed: 'This slot is closed',
  notEnoughSeats: 'Not enough seats available for this party',
  alreadyBooked: 'You already have a booking for this slot',
  badId: 'id must be a positive integer',
  onlyHikers: 'Only hikers have bookings',
};

// ---------- data helpers ----------

async function clearDb() {
  const db = await getDb();
  for (const table of ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

async function loggedIn(role = 'hiker') {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email, passwordHash: await hashPassword(PASSWORD), firstName: 'Hannah', lastName: 'Tester', role,
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return { agent, user: { ...user, email } };
}

/** A slot with its tables; seats = table sizes, e.g. [4, 6] → T1 (4), T2 (6). */
async function createSlot({ date = FAR, startTime = '19:00', endTime = '20:30', label = 'Dinner', status = 'open',
  seats = [4, 4, 6] } = {}) {
  const db = await getDb();
  return slotDao.create(db, {
    date, startTime, endTime, label, status, tables: seats.map((n, i) => ({ name: `T${i + 1}`, seats: n })),
  });
}

/** Books through the API; the test stops at once if the MH-01 rules refuse it. */
async function booked(agent, slotId, partySize) {
  const res = await agent.post('/api/bookings').send({ slotId, partySize });
  expect(res.status, 'booking set up by the test').toBe(201);
  return res.body;
}

/** A booking written straight into the database (e.g. in the past, which the API refuses). */
async function storedBooking(hikerId, slot, partySize, { status, requirements } = {}) {
  const db = await getDb();
  const booking = await bookingDao.create(db, {
    slotId: slot.id, hikerId, partySize, status, createdAt: '2026-10-20T08:00:00.000Z',
    tables: [{ slotTableId: slot.tables[0].id, seats: partySize }],
  });
  if (requirements) await bookingDao.saveRequirements(db, booking.id, requirements);
  return booking;
}

const change = (agent, id, body) => agent.patch(`/api/bookings/${id}`).send(body);
const seatsOf = (booking) => booking.tables.map(({ tableName, seats }) => `${tableName}:${seats}`).join('+');
const freeFor = async (slotId, partySize) =>
  (await request(app).get(`/api/public/slots/${slotId}/availability?partySize=${partySize}`)).body.available;

async function emailsTo(email) {
  return (await request(app).get(`/api/test/emails?recipient=${encodeURIComponent(email)}`)).body;
}

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
}

beforeEach(async () => {
  await clearDb();
  await request(app).delete('/api/test/emails');
});

// ---------- GET /api/bookings ----------

describe('GET /api/bookings', () => {
  it('lists only the hiker\'s own bookings: upcoming soonest first, then past most recent first', async () => {
    const { agent, user } = await loggedIn();
    const other = await loggedIn();
    const later = await createSlot({ date: '2026-11-12' });
    const sooner = await createSlot({ date: '2026-11-05', startTime: '12:00', label: 'Lunch' });
    const lastWeek = await createSlot({ date: '2026-10-28' });
    const yesterday = await createSlot({ date: '2026-11-01' });
    await booked(agent, later.id, 2);
    await storedBooking(user.id, lastWeek, 2);
    await booked(agent, sooner.id, 3);
    await storedBooking(user.id, yesterday, 4);
    await booked(other.agent, later.id, 2); // someone else's: never listed

    const res = await agent.get('/api/bookings');

    expect(res.status).toBe(200);
    expect(res.body.map((b) => b.slot.date)).toEqual(['2026-11-05', '2026-11-12', '2026-11-01', '2026-10-28']);
    expect(res.body[0]).toMatchObject({ partySize: 3, status: 'confirmed', requirements: [] });
  });

  it('returns an empty list to a hiker without bookings', async () => {
    const { agent } = await loggedIn();
    const res = await agent.get('/api/bookings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('includes the party requirements of each booking', async () => {
    const { agent, user } = await loggedIn();
    const requirements = [
      { hasAllergies: true, description: '1 shellfish allergy' },
      { hasAllergies: false, description: '2 vegetarians' },
    ];
    await storedBooking(user.id, await createSlot(), 3, { requirements });

    expect((await agent.get('/api/bookings')).body[0].requirements).toEqual(requirements);
  });

  it('changeable: false at and after exactly 48 h before the slot start, true only before that', async () => {
    const { agent } = await loggedIn();
    // Wed 4 Nov 10:00 is exactly 48 h after "now" (refused, PO #43); Wed 4 Nov 09:59 is 47 h 59 min (refused too).
    const exactly48h = await createSlot({ date: '2026-11-04', startTime: '10:00', endTime: '11:00' });
    const lessThan48h = await createSlot({ date: '2026-11-04', startTime: '09:59', endTime: '10:00' });
    const far = await createSlot();
    for (const slot of [exactly48h, lessThan48h, far]) await booked(agent, slot.id, 2);

    const res = await agent.get('/api/bookings');
    const changeable = Object.fromEntries(res.body.map((b) => [b.slot.id, b.changeable]));

    expect(changeable).toEqual({ [exactly48h.id]: false, [lessThan48h.id]: false, [far.id]: true });
  });

  it('a cancelled booking is listed, with its status, and is not changeable', async () => {
    const { agent, user } = await loggedIn();
    await storedBooking(user.id, await createSlot(), 2, { status: bookingDao.BOOKING_STATUS.CANCELLED });

    const [booking] = (await agent.get('/api/bookings')).body;

    expect(booking).toMatchObject({ status: 'cancelled', changeable: false });
  });

  it('refuses a guest (401) and staff (403)', async () => {
    expectError(await request(app).get('/api/bookings'), 401);
    for (const role of ['employee', 'warden']) {
      const { agent } = await loggedIn(role);
      expectError(await agent.get('/api/bookings'), 403, MESSAGES.onlyHikers);
    }
  });
});

// ---------- PATCH /api/bookings/{id}: accepted changes ----------

describe('PATCH /api/bookings/{id} – accepted changes', () => {
  it('a smaller party: 200 with the changed booking, same slot, same createdAt', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 4);

    const res = await change(agent, original.id, { partySize: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: original.id, partySize: 2, status: 'confirmed' });
    expect(res.body.slot).toEqual(original.slot);
    expect(res.body.createdAt).toBe(original.createdAt);
    expect(res.body.tables.reduce((total, { seats }) => total + seats, 0)).toBe(2);
  });

  it('a bigger party is seated again with the allocation rule, without its own seats', async () => {
    const { agent } = await loggedIn();
    const slot = await createSlot({ seats: [4, 6] });
    const original = await booked(agent, slot.id, 2); // the best single table: T1 (4)
    expect(seatsOf(original)).toBe('T1:2');

    const res = await change(agent, original.id, { partySize: 5 });

    expect(res.status).toBe(200);
    expect(seatsOf(res.body)).toBe('T2:5'); // the 6-seat table, T1 freed
  });

  it('a bigger party fits only because the booking\'s own seats are released', async () => {
    const { agent } = await loggedIn();
    const other = await loggedIn();
    const slot = await createSlot({ seats: [4, 4] });
    const original = await booked(agent, slot.id, 4); // T1 full
    await booked(other.agent, slot.id, 3); // T2: 1 free seat left

    const res = await change(agent, original.id, { partySize: 5 });

    expect(res.status).toBe(200);
    expect(seatsOf(res.body)).toBe('T1:4+T2:1');
  });

  it('a new slot: the booking moves, the old slot gets its seats back', async () => {
    const { agent } = await loggedIn();
    const lunch = await createSlot({ startTime: '12:00', endTime: '14:00', label: 'Lunch', seats: [4] });
    const dinner = await createSlot({ seats: [6] });
    const original = await booked(agent, lunch.id, 4);
    expect(await freeFor(lunch.id, 4)).toBe(false);

    const res = await change(agent, original.id, { slotId: dinner.id });

    expect(res.status).toBe(200);
    expect(res.body.slot).toMatchObject({ id: dinner.id, label: 'Dinner' });
    expect(seatsOf(res.body)).toBe('T1:4');
    expect(await freeFor(lunch.id, 4)).toBe(true);
  });

  it('a new slot and a new party size together', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot({ seats: [4] })).id, 2);
    const other = await createSlot({ date: '2026-11-11', seats: [8] });

    const res = await change(agent, original.id, { slotId: other.id, partySize: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ partySize: 7, slot: { id: other.id } });
  });

  it('requirements: the new list replaces the old one; an empty list removes them', async () => {
    const { agent, user } = await loggedIn();
    const original = await storedBooking(user.id, await createSlot(), 3, {
      requirements: [{ hasAllergies: true, description: '1 vegan, peanut allergy' }],
    });
    const requirements = [
      { hasAllergies: false, description: '1 vegetarian' },
      { hasAllergies: true, description: '1 shellfish allergy' },
    ];

    const replaced = await change(agent, original.id, { requirements });
    expect(replaced.status).toBe(200);
    expect(replaced.body.requirements).toEqual(requirements);
    expect(replaced.body.partySize).toBe(3); // what is not sent stays as it is

    const removed = await change(agent, original.id, { requirements: [] });
    expect(removed.status).toBe(200);
    expect(removed.body.requirements).toEqual([]);
  });

  it('sends one email to the hiker after a change', async () => {
    const { agent, user } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);
    await request(app).delete('/api/test/emails'); // the confirmation of the booking itself

    expect((await change(agent, original.id, { partySize: 3 })).status).toBe(200);

    const emails = await emailsTo(user.email);
    expect(emails).toHaveLength(1);
    // The wording is free: the email must say the booking was changed and show the new party size.
    expect(`${emails[0].subject}\n${emails[0].text}`).toMatch(/chang/i);
    expect(emails[0].text).toMatch(/3 people/);
  });
});

// ---------- PATCH /api/bookings/{id}: refused changes ----------

describe('PATCH /api/bookings/{id} – refused changes leave the booking as it was', () => {
  it('a bigger party that does not fit: 409, same party, same tables, no email', async () => {
    const { agent, user } = await loggedIn();
    const other = await loggedIn();
    const slot = await createSlot({ seats: [4] });
    const original = await booked(agent, slot.id, 2);
    await booked(other.agent, slot.id, 2); // the slot is now full
    await request(app).delete('/api/test/emails');

    expectError(await change(agent, original.id, { partySize: 3 }), 409, MESSAGES.notEnoughSeats);

    const [after] = (await agent.get('/api/bookings')).body;
    expect(after).toMatchObject({ id: original.id, partySize: 2 });
    expect(seatsOf(after)).toBe(seatsOf(original));
    expect(await emailsTo(user.email)).toEqual([]);
  });

  it('a new slot without enough seats: 409, the booking stays in its slot', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 5);
    const small = await createSlot({ date: '2026-11-11', seats: [4] });

    expectError(await change(agent, original.id, { slotId: small.id }), 409, MESSAGES.notEnoughSeats);
    expect((await agent.get('/api/bookings')).body[0].slot.id).toBe(original.slot.id);
  });

  it('a new slot where the hiker already has a booking: 409', async () => {
    const { agent } = await loggedIn();
    const first = await booked(agent, (await createSlot()).id, 2);
    const second = await booked(agent, (await createSlot({ date: '2026-11-11' })).id, 2);

    expectError(await change(agent, first.id, { slotId: second.slot.id }), 409, MESSAGES.alreadyBooked);
  });

  it('less than 48 h before the slot starts: 400, also for a requirements-only change', async () => {
    const { agent } = await loggedIn();
    const slot = await createSlot({ date: '2026-11-04', startTime: '10:00', endTime: '11:00' });
    const original = await booked(agent, slot.id, 2);
    setNow(`${TODAY}T10:01`); // 47 h 59 min before

    expectError(await change(agent, original.id, { partySize: 3 }), 400, MESSAGES.window);
    expectError(await change(agent, original.id, { requirements: [] }), 400, MESSAGES.window);
  });

  it('exactly 48 h before the slot starts: 400 too (PO answer: that instant itself is refused, #43)', async () => {
    const { agent } = await loggedIn();
    const slot = await createSlot({ date: '2026-11-04', startTime: '10:00', endTime: '11:00' });
    const original = await booked(agent, slot.id, 2);

    expectError(await change(agent, original.id, { partySize: 3 }), 400, MESSAGES.window);
  });

  it('a cancelled booking: 400', async () => {
    const { agent, user } = await loggedIn();
    const cancelled = await storedBooking(user.id, await createSlot(), 2, {
      status: bookingDao.BOOKING_STATUS.CANCELLED,
    });

    expectError(await change(agent, cancelled.id, { partySize: 3 }), 400, MESSAGES.cancelled);
  });

  it('a new slot that is closed: 400', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);
    const closed = await createSlot({ date: '2026-11-11', status: 'closed' });

    expectError(await change(agent, original.id, { slotId: closed.id }), 400, MESSAGES.closed);
  });

  it('a new slot starting within 2 hours: 400', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);
    const soon = await createSlot({ date: TODAY, startTime: '11:00', endTime: '12:00' });

    // The message depends on planning question 2 (does the 48 h rule apply to the new slot too?).
    expectError(await change(agent, original.id, { slotId: soon.id }), 400);
  });

  it('an unknown new slot: 404', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);

    expectError(await change(agent, original.id, { slotId: 999999 }), 404, MESSAGES.slotNotFound);
  });

  it('an empty body: 400 Nothing to change', async () => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);

    expectError(await change(agent, original.id, {}), 400, MESSAGES.nothing);
  });

  it.each([
    ['party size 0', { partySize: 0 }],
    ['party size not a number', { partySize: 'four' }],
    ['slot id 0', { slotId: 0 }],
    ['requirements not a list', { requirements: 'vegan' }],
    ['a requirement without the allergies flag', { requirements: [{ description: '1 vegan' }] }],
    ['a requirement with an empty description', { requirements: [{ hasAllergies: true, description: '  ' }] }],
  ])('an invalid body (%s): 400', async (_case, body) => {
    const { agent } = await loggedIn();
    const original = await booked(agent, (await createSlot()).id, 2);

    expectError(await change(agent, original.id, body), 400);
  });
});

// ---------- PATCH /api/bookings/{id}: who can change ----------

describe('PATCH /api/bookings/{id} – only the owner', () => {
  it('someone else\'s booking, staff or an unknown id: 404, so its existence is not revealed', async () => {
    const owner = await loggedIn();
    const original = await booked(owner.agent, (await createSlot()).id, 2);

    for (const role of ['hiker', 'employee', 'warden']) {
      const { agent } = await loggedIn(role);
      expectError(await change(agent, original.id, { partySize: 3 }), 404, MESSAGES.notFound);
    }
    expectError(await change(owner.agent, 999999, { partySize: 3 }), 404, MESSAGES.notFound);
    expect((await owner.agent.get('/api/bookings')).body[0].partySize).toBe(2);
  });

  it('a guest: 401; an id that is not a positive integer: 400', async () => {
    expectError(await request(app).patch('/api/bookings/1').send({ partySize: 2 }), 401);
    const { agent } = await loggedIn();
    expectError(await change(agent, 'abc', { partySize: 2 }), 400, MESSAGES.badId);
  });
});
