// MH-09 BT1 – integration tests of POST /api/slots/copy-week, written from the story, the PO answer (#45) and
// docs/openapi.yaml (copyWeek, CopyWeek, CopyWeekResult): team rule, tests come from the contract, not from the code.
// Real app, real SQLite (temporary DB from setupTestDb.js), real sessions; data through the DAOs, fixed clock.
//
//   POST /api/slots/copy-week { sourceWeek, targetWeek }   staff only:
//     201 { created: [Slot], replaced: [Slot], skipped: [{ date, startTime, endTime, label, reason }] }
//     400 invalid dates or the same week · 401 · 403 · 409 the target week has bookings
// The copy rules themselves (past, overlap, started slots, one transaction) are in test/unit/slots/copyWeek.test.js.
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

// "Now": Wednesday 4 Nov 2026, 10:00 in the hut. Next week: Mon 9 – Sun 15 Nov; the week after: 16 – 22 Nov.
const NEXT_WEEK = '2026-11-09';
const AFTER_NEXT = '2026-11-16';
useFixedClock('2026-11-04T10:00');

const app = createApp();
const PASSWORD = 'mountain-pass-123';

// ---------- data helpers (through the DAOs: tests never depend on the demo seed) ----------

async function clearDb() {
  const db = await getDb();
  for (const table of ['booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/** A logged-in agent (keeps the session cookie) for a new user of `role`, and the user. */
async function loggedIn(role) {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Test',
    lastName: role,
    role,
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return { agent, user };
}

async function insertSlot({ date, startTime = '12:00', endTime = '14:00', label = 'Lunch', tables = [{ name: 'T1', seats: 4 }] }) {
  return slotDao.create(await getDb(), { date, startTime, endTime, label, tables });
}

async function insertConfirmedBooking(slot, hiker) {
  return bookingDao.create(await getDb(), {
    slotId: slot.id,
    hikerId: hiker.id,
    partySize: 2,
    createdAt: '2026-11-01T08:00:00.000Z',
    tables: [{ slotTableId: slot.tables[0].id, seats: 2 }],
  });
}

const copy = (agent, body) => agent.post('/api/slots/copy-week').send(body);
const listWeek = (agent, monday) => {
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return agent.get(`/api/slots?from=${monday}&to=${sunday}`);
};

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

let employee;
beforeEach(async () => {
  await clearDb();
  ({ agent: employee } = await loggedIn('employee'));
});

// ---------- 201 ----------

describe('POST /api/slots/copy-week – 201', () => {
  it('answers created, replaced and skipped; the created slots have the shape of Slot', async () => {
    await insertSlot({ date: '2026-11-09', tables: [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 6 }] });

    const res = await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['created', 'replaced', 'skipped']);
    expect(res.body.created).toEqual([
      {
        id: expect.any(Number),
        date: '2026-11-16',
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
        status: 'open',
        past: false,
        menu: null,
        tables: [
          { id: expect.any(Number), name: 'T1', seats: 4 },
          { id: expect.any(Number), name: 'T2', seats: 6 },
        ],
      },
    ]);
    expect(res.body.replaced).toEqual([]);
    expect(res.body.skipped).toEqual([]);
  });

  it('the copies are in the weekly view of the target week, with their tables', async () => {
    await insertSlot({ date: '2026-11-09', label: 'Lunch' });
    await insertSlot({ date: '2026-11-13', startTime: '19:00', endTime: '20:30', label: 'Dinner' });

    const created = (await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT })).body.created;
    const week = await listWeek(employee, AFTER_NEXT);

    expect(week.status).toBe(200);
    expect(week.body).toEqual(created);
  });

  it('lists the replaced slots of the target week with the shape of Slot, and they are gone', async () => {
    await insertSlot({ date: '2026-11-09' });
    const old = await insertSlot({ date: '2026-11-18', startTime: '19:00', endTime: '21:00', label: 'Old dinner' });

    const res = await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT });

    expect(res.status).toBe(201);
    expect(res.body.replaced).toEqual([
      expect.objectContaining({ id: old.id, date: '2026-11-18', label: 'Old dinner', past: false, tables: [expect.objectContaining({ name: 'T1', seats: 4 })] }),
    ]);
    expect((await listWeek(employee, AFTER_NEXT)).body.map((slot) => slot.label)).toEqual(['Lunch']);
  });

  it('lists the skipped slots with their date in the target week and the reason', async () => {
    await insertSlot({ date: '2026-11-09', label: 'Monday lunch' }); // → Mon 2 Nov, in the past

    const res = await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: '2026-11-04' });

    expect(res.status).toBe(201);
    expect(res.body.skipped).toEqual([
      { date: '2026-11-02', startTime: '12:00', endTime: '14:00', label: 'Monday lunch', reason: 'past' },
    ]);
  });

  it('a copied slot is a normal slot: a hiker can book it', async () => {
    await insertSlot({ date: '2026-11-09' });
    const [created] = (await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT })).body.created;
    const { agent: hiker } = await loggedIn('hiker');

    const res = await hiker.post('/api/bookings').send({ slotId: created.id, partySize: 3 });

    expect(res.status).toBe(201);
    expect(res.body.slot).toMatchObject({ id: created.id, date: '2026-11-16' });
  });
});

// ---------- 409 ----------

describe('POST /api/slots/copy-week – 409', () => {
  it('refuses when the target week has a confirmed booking still to come, and nothing changes', async () => {
    await insertSlot({ date: '2026-11-09' });
    const booked = await insertSlot({ date: '2026-11-17', label: 'Booked lunch' });
    const { user: hiker } = await loggedIn('hiker');
    await insertConfirmedBooking(booked, hiker);
    const before = (await listWeek(employee, AFTER_NEXT)).body;

    const res = await copy(employee, { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT });

    expectError(res, 409, 'The target week has bookings: its schedule cannot be replaced');
    expect((await listWeek(employee, AFTER_NEXT)).body).toEqual(before);
  });
});

// ---------- who can copy ----------

describe('POST /api/slots/copy-week – staff only', () => {
  const body = { sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT };

  it('401 for a guest', async () => {
    expectError(await copy(request(app), body), 401);
  });

  it('403 "Staff only" for a hiker, and nothing is copied', async () => {
    await insertSlot({ date: '2026-11-09' });
    const { agent: hiker } = await loggedIn('hiker');

    expectError(await copy(hiker, body), 403, 'Staff only');
    expect((await listWeek(employee, AFTER_NEXT)).body).toEqual([]);
  });

  it('the warden can copy too', async () => {
    await insertSlot({ date: '2026-11-09' });
    const { agent: warden } = await loggedIn('warden');

    expect((await copy(warden, body)).status).toBe(201);
  });
});

// ---------- 400 ----------

describe('POST /api/slots/copy-week – 400', () => {
  it.each([
    ['no body', undefined],
    ['sourceWeek missing', { targetWeek: AFTER_NEXT }],
    ['targetWeek missing', { sourceWeek: NEXT_WEEK }],
    ['sourceWeek not YYYY-MM-DD', { sourceWeek: '2026-11-9', targetWeek: AFTER_NEXT }],
    ['targetWeek not a date', { sourceWeek: NEXT_WEEK, targetWeek: 'next week' }],
    ['sourceWeek not a real calendar date', { sourceWeek: '2026-02-30', targetWeek: AFTER_NEXT }],
    ['targetWeek a number', { sourceWeek: NEXT_WEEK, targetWeek: 20261116 }],
  ])('refuses %s', async (_case, body) => {
    expectError(await copy(employee, body), 400);
  });

  it('refuses the same week as source and target, also with two different dates of it', async () => {
    expectError(
      await copy(employee, { sourceWeek: '2026-11-09', targetWeek: '2026-11-15' }),
      400,
      'Choose a different week to copy into',
    );
  });
});
