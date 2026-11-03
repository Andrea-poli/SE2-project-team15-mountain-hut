// MH-02 BT2 – integration tests of the slot capacity APIs, written from the story, the planning and
// docs/openapi.yaml (team rule: tests come from the contract, not from the code). Real app, real SQLite
// (temporary DB from setupTestDb.js), real sessions; the data is created through the DAOs, the clock is fixed.
//
//   GET  /api/slots?from=&to=   staff only: slots of a range (max 31 days) with tables and `past`
//   POST /api/slots             staff only: 201 / 400 per rule / 401 / 403 / 409 overlap
//
// Needs MH-02 BE1 (slot creation logic) and BE2 (slot capacity APIs).
// Until they are on the story branch, this file fails: that is expected (see the PR).
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

/** A logged-in agent (keeps the session cookie) for a new user of `role`. */
async function loggedIn(role) {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  await userDao.create(db, {
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Test',
    lastName: role,
    role,
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return agent;
}

/** A slot saved directly through the DAO (also in the past, which the API refuses). */
async function insertSlot({ date = TOMORROW, startTime = '19:00', endTime = '20:30', label = 'Dinner',
  tables = [{ name: 'T1', seats: 4 }] } = {}) {
  return slotDao.create(await getDb(), { date, startTime, endTime, label, tables });
}

/** A valid body for POST /api/slots; `changes` replaces some fields. */
function newSlot(changes = {}) {
  return {
    date: TOMORROW,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner - 1st turn',
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 4 },
      { name: 'T3', seats: 6 },
    ],
    ...changes,
  };
}

const create = (agent, body) => agent.post('/api/slots').send(body);
const list = (agent, from, to) => agent.get(`/api/slots?from=${from}&to=${to}`);

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

let employee;
beforeEach(async () => {
  await clearDb();
  employee = await loggedIn('employee');
});

// ---------- POST /api/slots ----------

describe('POST /api/slots', () => {
  it('creates a slot with its tables: 201 and the Slot object', async () => {
    const res = await create(employee, newSlot());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      date: TOMORROW,
      startTime: '19:00',
      endTime: '20:30',
      label: 'Dinner - 1st turn',
      status: 'open',
      past: false,
      tables: [
        { id: expect.any(Number), name: 'T1', seats: 4 },
        { id: expect.any(Number), name: 'T2', seats: 4 },
        { id: expect.any(Number), name: 'T3', seats: 6 },
      ],
    });
  });

  it('saves the slot: the weekly list shows it', async () => {
    const { body: created } = await create(employee, newSlot());
    const res = await list(employee, TOMORROW, TOMORROW);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([created]);
  });

  it('accepts a slot with a single table', async () => {
    const res = await create(employee, newSlot({ tables: [{ name: 'Big table', seats: 12 }] }));
    expect(res.status).toBe(201);
    expect(res.body.tables).toEqual([{ id: expect.any(Number), name: 'Big table', seats: 12 }]);
  });

  it('lets each slot have its own tables (no fixed table set)', async () => {
    expect((await create(employee, newSlot({ startTime: '12:00', endTime: '14:00', label: 'Lunch',
      tables: [{ name: 'T1', seats: 8 }] }))).status).toBe(201);
    const res = await create(employee, newSlot({ tables: [{ name: 'T1', seats: 2 }, { name: 'T2', seats: 6 }] }));
    expect(res.status).toBe(201);
  });

  // --- time rules (now = 2 Nov, 10:00) ---

  it('accepts a slot starting later today', async () => {
    expect((await create(employee, newSlot({ date: TODAY, startTime: '10:01', endTime: '11:00' }))).status).toBe(201);
  });

  it.each([
    ['starting now', { date: TODAY, startTime: '10:00', endTime: '11:00' }],
    ['already started today', { date: TODAY, startTime: '09:00', endTime: '11:00' }],
    ['on a past day', { date: YESTERDAY, startTime: '19:00', endTime: '20:30' }],
  ])('refuses a slot %s with 400 (it must start after now)', async (_case, times) => {
    expectError(await create(employee, newSlot(times)), 400);
  });

  it.each([
    ['end before start', { startTime: '20:00', endTime: '19:00' }],
    ['end equal to start', { startTime: '19:00', endTime: '19:00' }],
  ])('refuses %s with 400', async (_case, times) => {
    expectError(await create(employee, newSlot(times)), 400, 'endTime must be after startTime');
  });

  // --- overlap (409) and adjacent turns ---

  it.each([
    ['same times', '19:00', '20:30'],
    ['starting inside the other one', '20:00', '21:00'],
    ['ending inside the other one', '18:00', '19:30'],
    ['inside the other one', '19:30', '20:00'],
    ['around the other one', '18:00', '22:00'],
  ])('refuses a slot overlapping another one of the same day (%s) with 409', async (_case, startTime, endTime) => {
    await insertSlot({ startTime: '19:00', endTime: '20:30' });
    expectError(await create(employee, newSlot({ startTime, endTime })), 409, 'Overlaps an existing slot');
  });

  it('refuses 12:30–14:00 when 12:00–13:00 exists (planning example)', async () => {
    await insertSlot({ startTime: '12:00', endTime: '13:00', label: 'Lunch' });
    const res = await create(employee, newSlot({ startTime: '12:30', endTime: '14:00', label: 'Late lunch' }));
    expectError(res, 409, 'Overlaps an existing slot');
  });

  it.each([
    ['right after (end == next start)', '20:30', '22:00'],
    ['right before (end == next start)', '17:30', '19:00'],
  ])('accepts an adjacent turn %s', async (_case, startTime, endTime) => {
    await insertSlot({ startTime: '19:00', endTime: '20:30' });
    expect((await create(employee, newSlot({ startTime, endTime, label: 'Dinner - 2nd turn' }))).status).toBe(201);
  });

  it('accepts the same times on another day', async () => {
    await insertSlot({ date: TOMORROW, startTime: '19:00', endTime: '20:30' });
    expect((await create(employee, newSlot({ date: '2026-11-04' }))).status).toBe(201);
  });

  it('a refused slot is not saved, tables included', async () => {
    await insertSlot({ startTime: '19:00', endTime: '20:30' });
    expect((await create(employee, newSlot({ startTime: '20:00', endTime: '21:00' }))).status).toBe(409);

    const db = await getDb();
    expect(await db.get('SELECT COUNT(*) AS n FROM slots')).toEqual({ n: 1 });
    expect(await db.get('SELECT COUNT(*) AS n FROM slot_tables')).toEqual({ n: 1 });
  });

  it('two overlapping slots created at the same time: one 201, one 409', async () => {
    const other = await loggedIn('warden');
    const results = await Promise.all([
      create(employee, newSlot({ startTime: '19:00', endTime: '20:30' })),
      create(other, newSlot({ startTime: '20:00', endTime: '21:30' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const db = await getDb();
    expect(await db.get('SELECT COUNT(*) AS n FROM slots')).toEqual({ n: 1 });
  });

  // --- tables ---

  it('refuses a slot without tables with 400', async () => {
    expectError(await create(employee, newSlot({ tables: [] })), 400, 'A slot needs at least one table');
  });

  it('refuses duplicated table names with 400', async () => {
    const tables = [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 4 }, { name: 'T1', seats: 6 }];
    expectError(await create(employee, newSlot({ tables })), 400, 'Table names must be unique within the slot');
  });

  it.each([
    ['0 seats', { name: 'T1', seats: 0 }],
    ['negative seats', { name: 'T1', seats: -2 }],
    ['decimal seats', { name: 'T1', seats: 2.5 }],
    ['seats as text', { name: 'T1', seats: 'four' }],
    ['missing seats', { name: 'T1' }],
    ['empty name', { name: '', seats: 4 }],
    ['missing name', { seats: 4 }],
  ])('refuses a table with %s with 400', async (_case, table) => {
    expectError(await create(employee, newSlot({ tables: [{ name: 'T0', seats: 4 }, table] })), 400);
  });

  // --- body format ---

  it.each([
    ['no body', undefined],
    ['missing date', newSlot({ date: undefined })],
    ['date not on the calendar', newSlot({ date: '2026-02-30' })],
    ['date in another format', newSlot({ date: '03/11/2026' })],
    ['missing startTime', newSlot({ startTime: undefined })],
    ['startTime without leading zero', newSlot({ startTime: '9:00', endTime: '10:00' })],
    ['impossible endTime', newSlot({ endTime: '25:00' })],
    ['impossible minutes', newSlot({ endTime: '20:60' })],
    ['missing label', newSlot({ label: undefined })],
    ['empty label', newSlot({ label: '' })],
    ['blank label', newSlot({ label: '   ' })], // schema.sql refuses it too: it must be a 400, not a 500
    ['missing tables', newSlot({ tables: undefined })],
    ['tables not a list', newSlot({ tables: 'T1' })],
  ])('refuses an invalid body (%s) with 400', async (_case, body) => {
    expectError(await create(employee, body), 400);
  });

  // --- roles ---

  it('refuses a guest with 401', async () => {
    expectError(await create(request(app), newSlot()), 401);
  });

  it('refuses a hiker with 403', async () => {
    expectError(await create(await loggedIn('hiker'), newSlot()), 403);
  });

  it('lets the warden create slots too (the warden passes every employee check)', async () => {
    expect((await create(await loggedIn('warden'), newSlot())).status).toBe(201);
  });
});

// ---------- GET /api/slots ----------

describe('GET /api/slots', () => {
  it('lists the slots of the range with their tables, ordered by date, then start time', async () => {
    const dinner3 = await insertSlot({ date: TOMORROW, startTime: '19:00', endTime: '20:30', label: 'Dinner' });
    const lunch3 = await insertSlot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    const lunch4 = await insertSlot({ date: '2026-11-04', startTime: '12:00', endTime: '14:00', label: 'Lunch',
      tables: [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 6 }] });

    const res = await list(employee, TOMORROW, '2026-11-04');

    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id)).toEqual([lunch3.id, dinner3.id, lunch4.id]);
    expect(res.body[2]).toEqual({
      id: lunch4.id,
      date: '2026-11-04',
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      status: 'open',
      past: false,
      tables: [
        { id: expect.any(Number), name: 'T1', seats: 4 },
        { id: expect.any(Number), name: 'T2', seats: 6 },
      ],
    });
  });

  it('includes both ends of the range and nothing outside it', async () => {
    await insertSlot({ date: '2026-11-01', label: 'Before' });
    const first = await insertSlot({ date: '2026-11-02', startTime: '19:00', label: 'First day' });
    const last = await insertSlot({ date: '2026-11-08', label: 'Last day' });
    await insertSlot({ date: '2026-11-09', label: 'After' });

    const res = await list(employee, '2026-11-02', '2026-11-08');
    expect(res.body.map((s) => s.id)).toEqual([first.id, last.id]);
  });

  it('answers an empty list for a range without slots', async () => {
    const res = await list(employee, '2026-11-09', '2026-11-15');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('orders the tables by name, numbers in natural order (T2 before T10)', async () => {
    await insertSlot({
      tables: [{ name: 'T10', seats: 4 }, { name: 'T2', seats: 4 }, { name: 'T1', seats: 4 }],
    });
    const res = await list(employee, TOMORROW, TOMORROW);
    expect(res.body[0].tables.map((t) => t.name)).toEqual(['T1', 'T2', 'T10']);
  });

  it('marks as past the slots starting at or before now (2 Nov, 10:00)', async () => {
    const yesterday = await insertSlot({ date: YESTERDAY, startTime: '19:00', endTime: '20:30' });
    const started = await insertSlot({ date: TODAY, startTime: '08:00', endTime: '09:30' });
    const startsNow = await insertSlot({ date: TODAY, startTime: '10:00', endTime: '11:00' });
    const later = await insertSlot({ date: TODAY, startTime: '12:00', endTime: '14:00' });
    const tomorrow = await insertSlot({ date: TOMORROW });

    const res = await list(employee, YESTERDAY, TOMORROW);
    const past = Object.fromEntries(res.body.map((s) => [s.id, s.past]));
    expect(past).toEqual({
      [yesterday.id]: true,
      [started.id]: true,
      [startsNow.id]: true,
      [later.id]: false,
      [tomorrow.id]: false,
    });
  });

  it('accepts a one-day range and a whole month of 31 days', async () => {
    expect((await list(employee, TODAY, TODAY)).status).toBe(200);
    expect((await list(employee, '2026-12-01', '2026-12-31')).status).toBe(200);
  });

  it('refuses a range longer than 31 days with 400', async () => {
    expectError(await list(employee, '2026-12-01', '2027-01-02'), 400, 'The range cannot exceed 31 days');
  });

  it('refuses `to` before `from` with 400', async () => {
    expectError(await list(employee, '2026-11-08', '2026-11-02'), 400);
  });

  it.each([
    ['missing from', '/api/slots?to=2026-11-08'],
    ['missing to', '/api/slots?from=2026-11-02'],
    ['no parameters', '/api/slots'],
    ['from not a date', '/api/slots?from=monday&to=2026-11-08'],
    ['to in another format', '/api/slots?from=2026-11-02&to=08/11/2026'],
    ['from not on the calendar', '/api/slots?from=2026-02-30&to=2026-03-02'],
  ])('refuses invalid dates (%s) with 400', async (_case, url) => {
    expectError(await employee.get(url), 400);
  });

  it('refuses a guest with 401', async () => {
    expectError(await list(request(app), TODAY, TOMORROW), 401);
  });

  it('refuses a hiker with 403', async () => {
    expectError(await list(await loggedIn('hiker'), TODAY, TOMORROW), 403, 'Staff only');
  });

  it('lets the warden read the slots too', async () => {
    await insertSlot();
    const res = await list(await loggedIn('warden'), TOMORROW, TOMORROW);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
