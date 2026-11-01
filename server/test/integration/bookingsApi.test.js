// MH-01 BT2 – integration tests of the booking APIs, written from the story and docs/openapi.yaml
// (team rule: tests come from the contract, not from the code). Real app, real SQLite (temporary DB
// from setupTestDb.js), real sessions; the data is created through the DAOs, the clock is fixed.
//
//   GET  /api/public/slots?date=   public list of a day's slots with bookingState
//   POST /api/bookings             hikers only: 201 / 400 / 401 / 403 / 404 / 409
//   GET  /api/bookings/:id         owner only: 200 / 400 / 401 / 404
//
// Needs the backend base (common/base-backend: DAOs, auth, sessions) and MH-01 BE1a/BE1b/BE2.
// Until they are on the branch, this file fails: that is expected (see the PR).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut (same day as the E2E tests).
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
useFixedClock(`${TODAY}T10:00`);

const app = createApp();
const PASSWORD = 'mountain-pass-123';

// ---------- data helpers (through the DAOs: tests never depend on the demo seed) ----------

async function clearDb() {
  const db = await getDb();
  for (const table of ['booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

async function createUser(role) {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: role === 'hiker' ? 'Hannah' : 'Eric',
    lastName: 'Tester',
    phone: '+393331234567',
    role,
  });
  return { ...user, email };
}

/** A logged-in agent (keeps the session cookie) for a new user of `role`. */
async function loggedIn(role = 'hiker') {
  const user = await createUser(role);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return { agent, user };
}

/** Creates a slot with its tables; seats = list of table sizes, e.g. [4, 4, 6]. */
async function createSlot({ date = TOMORROW, startTime = '19:00', endTime = '20:30', label = 'Dinner',
  status = 'open', seats = [4, 4, 6] } = {}) {
  const db = await getDb();
  const tables = seats.map((n, i) => ({ name: `T${i + 1}`, seats: n }));
  return slotDao.create(db, { date, startTime, endTime, label, status, tables });
}

const book = (agent, slotId, partySize) => agent.post('/api/bookings').send({ slotId, partySize });

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

beforeEach(clearDb);

// ---------- GET /api/public/slots ----------

describe('GET /api/public/slots', () => {
  it('lists the open slots of a day, ordered by start time, with the PublicSlot fields only', async () => {
    const dinner = await createSlot({ startTime: '19:00', endTime: '20:30', label: 'Dinner' });
    const lunch = await createSlot({ startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    await createSlot({ date: '2026-11-04', label: 'Other day' });

    const res = await request(app).get(`/api/public/slots?date=${TOMORROW}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: lunch.id, label: 'Lunch', startTime: '12:00', endTime: '14:00', bookingState: 'bookable' },
      { id: dinner.id, label: 'Dinner', startTime: '19:00', endTime: '20:30', bookingState: 'bookable' },
    ]);
  });

  it('needs no login', async () => {
    await createSlot();
    const res = await request(app).get(`/api/public/slots?date=${TOMORROW}`);
    expect(res.status).toBe(200);
  });

  it('does not list closed slots', async () => {
    await createSlot({ status: 'closed', label: 'Closed dinner' });
    const res = await request(app).get(`/api/public/slots?date=${TOMORROW}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('marks a slot with no free seat as full, and never shows seat counts', async () => {
    const slot = await createSlot({ seats: [4] });
    const { agent } = await loggedIn();
    expect((await book(agent, slot.id, 4)).status).toBe(201);

    const res = await request(app).get(`/api/public/slots?date=${TOMORROW}`);
    expect(res.body).toEqual([expect.objectContaining({ id: slot.id, bookingState: 'full' })]);
    expect(Object.keys(res.body[0]).sort()).toEqual(['bookingState', 'endTime', 'id', 'label', 'startTime']);
  });

  it('marks as tooLate a slot starting within 2 hours, and one already started', async () => {
    // now = 10:00: 11:30 starts in 1 h 30, 09:00 has started; 12:00 is exactly 2 h away.
    const soon = await createSlot({ date: TODAY, startTime: '11:30', endTime: '12:00', label: 'Soon' });
    const started = await createSlot({ date: TODAY, startTime: '09:00', endTime: '09:45', label: 'Started' });
    const atLimit = await createSlot({ date: TODAY, startTime: '12:00', endTime: '14:00', label: 'At the limit' });

    const res = await request(app).get(`/api/public/slots?date=${TODAY}`);
    expect(res.status).toBe(200);
    const state = Object.fromEntries(res.body.map((s) => [s.id, s.bookingState]));
    expect(state[soon.id]).toBe('tooLate');
    expect(state[started.id]).toBe('tooLate');
    // "up to 2 hours before the due time" (PO, MH-01): exactly 2 h before is still bookable.
    expect(state[atLimit.id]).toBe('bookable');
  });

  it('answers an empty list for a day without slots', async () => {
    const res = await request(app).get('/api/public/slots?date=2026-11-09');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    ['missing', ''],
    ['not a date', '?date=tomorrow'],
    ['wrong format', '?date=03/11/2026'],
    ['impossible day', '?date=2026-02-30'],
  ])('refuses an invalid date (%s) with 400', async (_case, query) => {
    const res = await request(app).get(`/api/public/slots${query}`);
    expectError(res, 400, 'date must be YYYY-MM-DD');
  });
});

// ---------- POST /api/bookings ----------

describe('POST /api/bookings', () => {
  it('books a table: 201, Location header and the Booking object', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });
    const { agent } = await loggedIn();

    const res = await book(agent, slot.id, 3);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/bookings/${res.body.id}`);
    expect(res.body).toEqual({
      id: expect.any(Number),
      slot: { id: slot.id, date: TOMORROW, startTime: '19:00', endTime: '20:30', label: 'Dinner' },
      partySize: 3,
      tables: [expect.objectContaining({ slotTableId: expect.any(Number), tableName: expect.any(String), seats: 3 })],
      status: 'confirmed',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/),
    });
    expect(res.body).not.toHaveProperty('hikerId');
  });

  it('seats the whole party: the seats of the assigned tables add up to the party size', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });
    const { agent } = await loggedIn();

    const res = await book(agent, slot.id, 9); // no single table fits: the party is split
    expect(res.status).toBe(201);
    const seated = res.body.tables.reduce((sum, t) => sum + t.seats, 0);
    expect(seated).toBe(9);
    expect(res.body.tables.length).toBe(2); // as few tables as possible (6 + a 4)
  });

  it('keeps the party at one table when one table has room (PO: split only when needed)', async () => {
    const slot = await createSlot({ seats: [8, 4, 4] });
    const { agent } = await loggedIn();
    const res = await book(agent, slot.id, 8);
    expect(res.status).toBe(201);
    expect(res.body.tables).toEqual([expect.objectContaining({ tableName: 'T1', seats: 8 })]);
  });

  // The examples of the allocation rule in openapi.yaml (info): tables 6, 4, 4.
  it.each([
    [8, [['T2', 4], ['T3', 4]]], // no single table fits: the two 4s leave no seat unused
    [5, [['T1', 5]]], // one table fits: the 6
  ])('contract example: tables 6, 4, 4 and a party of %i', async (partySize, expected) => {
    const slot = await createSlot({ seats: [6, 4, 4] });
    const { agent } = await loggedIn();
    const res = await book(agent, slot.id, partySize);
    expect(res.status).toBe(201);
    const seating = res.body.tables.map((t) => [t.tableName, t.seats]).sort();
    expect(seating).toEqual(expected);
  });

  it('accepts a party exactly as big as the free seats, and refuses one person more with 409', async () => {
    // PO, issue #12: "with 6 free seats split over 3 tables of 2, a party of 6 is available".
    const slot = await createSlot({ seats: [4, 4] });
    const first = await loggedIn();
    expect((await book(first.agent, slot.id, 3)).status).toBe(201); // 5 free seats left

    const tooMany = await loggedIn();
    expectError(await book(tooMany.agent, slot.id, 6), 409, 'Not enough seats available for this party');

    const exact = await loggedIn();
    expect((await book(exact.agent, slot.id, 5)).status).toBe(201);
  });

  it('refuses a second booking of the same hiker in the same slot with 409', async () => {
    const slot = await createSlot();
    const { agent } = await loggedIn();
    expect((await book(agent, slot.id, 2)).status).toBe(201);
    expectError(await book(agent, slot.id, 2), 409, 'You already have a booking for this slot');
  });

  it('lets the same hiker book two different slots', async () => {
    const lunch = await createSlot({ startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    const dinner = await createSlot({ startTime: '19:00', endTime: '20:30', label: 'Dinner' });
    const { agent } = await loggedIn();
    expect((await book(agent, lunch.id, 2)).status).toBe(201);
    expect((await book(agent, dinner.id, 2)).status).toBe(201);
  });

  it('two bookings at the same time for the last seats: one 201, one 409, no overbooking', async () => {
    const slot = await createSlot({ seats: [4] });
    const a = await loggedIn();
    const b = await loggedIn();

    const results = await Promise.all([book(a.agent, slot.id, 3), book(b.agent, slot.id, 3)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const db = await getDb();
    const { taken } = await db.get(
      `SELECT COALESCE(SUM(bt.seats), 0) AS taken FROM booking_tables bt
       JOIN bookings bk ON bk.id = bt.booking_id WHERE bk.slot_id = ? AND bk.status = 'confirmed'`,
      [slot.id],
    );
    expect(taken).toBe(3);
  });

  it('refuses a slot starting within 2 hours with 400', async () => {
    const slot = await createSlot({ date: TODAY, startTime: '11:00', endTime: '12:00' });
    const { agent } = await loggedIn();
    expectError(await book(agent, slot.id, 2), 400, 'Bookings are accepted up to 2 hours before the slot starts');
  });

  it('accepts a slot starting exactly 2 hours from now', async () => {
    const slot = await createSlot({ date: TODAY, startTime: '12:00', endTime: '14:00' });
    const { agent } = await loggedIn();
    expect((await book(agent, slot.id, 2)).status).toBe(201);
  });

  it('refuses a closed slot with 400', async () => {
    const slot = await createSlot({ status: 'closed' });
    const { agent } = await loggedIn();
    expectError(await book(agent, slot.id, 2), 400, 'This slot is closed');
  });

  it.each([
    ['no body', undefined],
    ['missing partySize', { slotId: 1 }],
    ['missing slotId', { partySize: 2 }],
    ['partySize 0', { slotId: 1, partySize: 0 }],
    ['negative partySize', { slotId: 1, partySize: -2 }],
    ['decimal partySize', { slotId: 1, partySize: 2.5 }],
    ['partySize as text', { slotId: 1, partySize: 'two' }],
    ['slotId 0', { slotId: 0, partySize: 2 }],
  ])('refuses an invalid body (%s) with 400', async (_case, body) => {
    const { agent } = await loggedIn();
    const res = await agent.post('/api/bookings').send(body);
    expectError(res, 400);
  });

  it('refuses an unknown slot with 404', async () => {
    const { agent } = await loggedIn();
    expectError(await book(agent, 999999, 2), 404, 'Slot not found');
  });

  it('refuses a guest with 401', async () => {
    const slot = await createSlot();
    expectError(await book(request(app), slot.id, 2), 401);
  });

  it.each(['employee', 'warden'])('refuses the %s with 403: only hikers book online', async (role) => {
    const slot = await createSlot();
    const { agent } = await loggedIn(role);
    expectError(await book(agent, slot.id, 2), 403, 'Only hikers can book');
  });

  it('a refused booking does not take any seat', async () => {
    const slot = await createSlot({ seats: [4] });
    const { agent } = await loggedIn();
    expect((await book(agent, slot.id, 5)).status).toBe(409);
    const other = await loggedIn();
    expect((await book(other.agent, slot.id, 4)).status).toBe(201);
  });
});

// ---------- GET /api/bookings/:id ----------

describe('GET /api/bookings/:id', () => {
  it('returns your own booking, the same object as the creation', async () => {
    const slot = await createSlot();
    const { agent } = await loggedIn();
    const created = (await book(agent, slot.id, 2)).body;

    const res = await agent.get(`/api/bookings/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it("answers 404 for someone else's booking, as for an unknown one (existence not revealed)", async () => {
    const slot = await createSlot();
    const owner = await loggedIn();
    const { id } = (await book(owner.agent, slot.id, 2)).body;

    const other = await loggedIn();
    const res = await other.agent.get(`/api/bookings/${id}`);
    expectError(res, 404, 'Booking not found');

    const unknown = await other.agent.get('/api/bookings/999999');
    expect(unknown.body).toEqual(res.body);
  });

  it('answers 404 to staff too', async () => {
    const slot = await createSlot();
    const owner = await loggedIn();
    const { id } = (await book(owner.agent, slot.id, 2)).body;
    const { agent } = await loggedIn('warden');
    expectError(await agent.get(`/api/bookings/${id}`), 404, 'Booking not found');
  });

  it('refuses a guest with 401', async () => {
    expectError(await request(app).get('/api/bookings/1'), 401);
  });

  it.each(['abc', '0', '-3', '1.5'])('refuses the id "%s" with 400', async (id) => {
    const { agent } = await loggedIn();
    expectError(await agent.get(`/api/bookings/${id}`), 400, 'id must be a positive integer');
  });
});
