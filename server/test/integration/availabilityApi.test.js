// MH-04 BT1 – integration tests of the availability check, written from the story, the planning and
// docs/openapi.yaml (team rule: tests come from the contract, not from the code). Real app, real SQLite
// (temporary DB from setupTestDb.js); the data is created through the DAOs, the clock is fixed.
//
//   GET /api/public/slots/:id/availability?partySize=   public: 200 { available, split } / 400 / 404
//
// Needs MH-04 BE1 (availability API) and MH-01 BE1a (allocate, freeSeats, bookingClosed).
// Until they are on the story branch, this file fails: that is expected (see the PR).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import * as bookingDao from '../../src/dao/bookingDao.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut (same day as the E2E tests).
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
const YESTERDAY = '2026-11-01';
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

/** Creates a slot; seats = list of table sizes, named T1, T2, … in order (e.g. [6, 4, 4]). */
async function createSlot({ date = TOMORROW, startTime = '19:00', endTime = '20:30', label = 'Dinner',
  status = 'open', seats = [4, 4, 6] } = {}) {
  const tables = seats.map((n, i) => ({ name: `T${i + 1}`, seats: n }));
  return slotDao.create(await getDb(), { date, startTime, endTime, label, status, tables });
}

/**
 * Saves a booking of a new hiker that takes `taken` seats at the named tables, e.g. { T1: 3 }.
 * status: 'confirmed' (default) or 'cancelled'.
 */
async function createBooking(slot, taken, status = 'confirmed') {
  const db = await getDb();
  const hiker = await userDao.create(db, {
    email: `hiker-${randomUUID()}@example.com`,
    firstName: 'Other',
    lastName: 'Hiker',
    role: 'hiker',
  });
  const tables = Object.entries(taken).map(([name, seats]) => ({
    slotTableId: slot.tables.find((t) => t.name === name).id,
    seats,
  }));
  const partySize = tables.reduce((sum, t) => sum + t.seats, 0);
  return bookingDao.create(db, {
    slotId: slot.id,
    hikerId: hiker.id,
    partySize,
    status,
    createdAt: '2026-11-01T08:00:00.000Z',
    tables,
  });
}

const check = (slotId, partySize, agent = request(app)) =>
  agent.get(`/api/public/slots/${slotId}/availability?partySize=${partySize}`);

/** The split as [tableName, seats] pairs, sorted by table name: the contract does not fix the order. */
const seating = (res) => res.body.split.map((t) => [t.tableName, t.seats]).sort();

/** The answer for a party that cannot be seated (also closed / too late): 200, never an error. */
function expectNotAvailable(res) {
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ available: false, split: [] });
}

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

beforeEach(clearDb);

// ---------- available, with the split ----------

describe('GET /api/public/slots/:id/availability – available', () => {
  it('answers available with the split: one entry per table with its id, name and the seats taken', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });

    const res = await check(slot.id, 3);

    expect(res.status).toBe(200);
    const t1 = slot.tables.find((t) => t.name === 'T1');
    expect(res.body).toEqual({ available: true, split: [{ slotTableId: t1.id, tableName: 'T1', seats: 3 }] });
  });

  it('needs no login', async () => {
    const slot = await createSlot();
    expect((await check(slot.id, 2)).status).toBe(200);
  });

  it('gives a logged-in user the same answer as a guest', async () => {
    const slot = await createSlot();
    const db = await getDb();
    const email = `hiker-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    await userDao.create(db, { email, passwordHash, firstName: 'Hannah', lastName: 'Hiker', role: 'hiker' });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200);

    expect((await check(slot.id, 2, agent)).body).toEqual((await check(slot.id, 2)).body);
  });

  it('never shows seat counts: only available and split', async () => {
    const slot = await createSlot();
    const res = await check(slot.id, 2);
    expect(Object.keys(res.body).sort()).toEqual(['available', 'split']);
    expect(Object.keys(res.body.split[0]).sort()).toEqual(['seats', 'slotTableId', 'tableName']);
  });

  // The examples of the allocation rule (openapi.yaml info, planning 4.3 B).
  it.each([
    ['8, 4, 4', 8, [8, 4, 4], [['T1', 8]]], // one table fits: the 8
    ['6, 4, 4', 8, [6, 4, 4], [['T2', 4], ['T3', 4]]], // no single table: the two 4s leave no seat unused
    ['6, 4, 4', 5, [6, 4, 4], [['T1', 5]]], // one table fits: the 6
  ])('allocation rule: tables %s and a party of %i', async (_tables, partySize, seats, expected) => {
    const slot = await createSlot({ seats });
    const res = await check(slot.id, partySize);
    expect(res.body.available).toBe(true);
    expect(seating(res)).toEqual(expected);
  });

  it('splits a party only when no single table has room, using as few tables as possible', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });
    const res = await check(slot.id, 9);
    expect(res.body.available).toBe(true);
    expect(res.body.split).toHaveLength(2);
    expect(res.body.split.reduce((sum, t) => sum + t.seats, 0)).toBe(9);
  });

  it('on a tie, uses the lowest table ids', async () => {
    const slot = await createSlot({ seats: [4, 4, 4] });
    expect(seating(await check(slot.id, 4))).toEqual([['T1', 4]]);
  });

  it('counts the seats already booked: a table can be shared with another party', async () => {
    const slot = await createSlot({ seats: [4, 6] });
    await createBooking(slot, { T2: 4 }); // free: T1 = 4, T2 = 2

    expect(seating(await check(slot.id, 2))).toEqual([['T2', 2]]); // the 2 free seats of T2 fit exactly

    // 5 people: no table has 5 free seats, so both tables, never more seats than are free at each.
    const { split } = (await check(slot.id, 5)).body;
    expect(split.map((t) => t.tableName).sort()).toEqual(['T1', 'T2']);
    expect(split.reduce((sum, t) => sum + t.seats, 0)).toBe(5);
    expect(split.find((t) => t.tableName === 'T2').seats).toBeLessThanOrEqual(2);
  });

  it('accepts a party exactly as big as the free seats, split over the tables', async () => {
    // PO, issue #12: "with 6 free seats split over 3 tables of 2, a party of 6 is available".
    const slot = await createSlot({ seats: [2, 2, 2] });
    const res = await check(slot.id, 6);
    expect(res.body.available).toBe(true);
    expect(seating(res)).toEqual([['T1', 2], ['T2', 2], ['T3', 2]]);
  });

  it('ignores cancelled bookings: their seats are free', async () => {
    const slot = await createSlot({ seats: [4] });
    await createBooking(slot, { T1: 4 }, 'cancelled');
    const res = await check(slot.id, 4);
    expect(res.body).toEqual({ available: true, split: [expect.objectContaining({ tableName: 'T1', seats: 4 })] });
  });

  it('only checks: nothing is booked, the same check gives the same answer', async () => {
    const slot = await createSlot({ seats: [4] });
    const first = await check(slot.id, 4);
    const second = await check(slot.id, 4);
    expect(second.body).toEqual(first.body);
    expect(await (await getDb()).get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 0 });
  });
});

// ---------- not available: 200 with available false, never an error ----------

describe('GET /api/public/slots/:id/availability – not available', () => {
  it('answers not available for one person more than the free seats', async () => {
    const slot = await createSlot({ seats: [4, 4] });
    await createBooking(slot, { T1: 3 }); // 5 free seats left
    expect((await check(slot.id, 5)).body.available).toBe(true);
    expectNotAvailable(await check(slot.id, 6));
  });

  it('answers not available for a full slot', async () => {
    const slot = await createSlot({ seats: [4, 2] });
    await createBooking(slot, { T1: 4, T2: 2 });
    expectNotAvailable(await check(slot.id, 1));
  });

  it('answers not available, not 400, for a party bigger than the whole slot (no limit on partySize)', async () => {
    const slot = await createSlot({ seats: [4, 4, 6] });
    expectNotAvailable(await check(slot.id, 1000));
  });

  it('answers not available for a closed slot, even with free seats', async () => {
    const slot = await createSlot({ status: 'closed' });
    expectNotAvailable(await check(slot.id, 2));
  });

  // Booking deadline (PO): up to 2 hours before the start. now = 2 Nov, 10:00.
  it('answers available for a slot starting exactly 2 hours from now', async () => {
    const slot = await createSlot({ date: TODAY, startTime: '12:00', endTime: '14:00' });
    expect((await check(slot.id, 2)).body.available).toBe(true);
  });

  it.each([
    ['starting in 1 h 59', { date: TODAY, startTime: '11:59', endTime: '13:00' }],
    ['starting now', { date: TODAY, startTime: '10:00', endTime: '11:00' }],
    ['already started', { date: TODAY, startTime: '09:00', endTime: '11:00' }],
    ['on a past day', { date: YESTERDAY, startTime: '19:00', endTime: '20:30' }],
  ])('answers not available for a slot %s', async (_case, times) => {
    const slot = await createSlot(times);
    expectNotAvailable(await check(slot.id, 2));
  });
});

// ---------- errors ----------

describe('GET /api/public/slots/:id/availability – errors', () => {
  it('answers 404 for an unknown slot', async () => {
    expectError(await check(999999, 2), 404, 'Slot not found');
  });

  it.each([
    ['missing', ''],
    ['0', '?partySize=0'],
    ['negative', '?partySize=-2'],
    ['decimal', '?partySize=2.5'],
    ['text', '?partySize=two'],
    ['empty', '?partySize='],
  ])('refuses an invalid partySize (%s) with 400', async (_case, query) => {
    const slot = await createSlot();
    const res = await request(app).get(`/api/public/slots/${slot.id}/availability${query}`);
    expectError(res, 400, 'partySize must be a positive integer');
  });

  it.each(['abc', '0', '-3', '1.5'])('refuses the slot id "%s" with 400', async (id) => {
    expectError(await check(id, 2), 400);
  });
});
