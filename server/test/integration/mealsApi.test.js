// MH-11 BT1 – integration tests of the public meals API, written from the story and docs/openapi.yaml (team rule:
// tests come from the contract, not from the code). Real app, real SQLite (temporary DB from setupTestDb.js), real
// sessions; the data is created through the DAOs, the clock is fixed.
//
//   GET /api/public/meals?from=&to=   public (any user, logged in or not): the open slots of the range with their
//                                      times, label, `past` and menu; no seats, no tables; same range rules as
//                                      GET /api/slots (valid calendar dates, `to` not before `from`, max 31 days)
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import { clearDb, createSlot, loggedIn } from '../helpers/bookingApi.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut.
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
const YESTERDAY = '2026-11-01';
useFixedClock(`${TODAY}T10:00`);

const app = createApp();
const POLENTA = '**Polenta** with mushrooms\n- Soup of the day\n  - vegetarian on request';

/** GET /api/public/meals as a guest (or as `agent`); `query` is sent as it is. */
const meals = (query, agent = request(app)) => agent.get('/api/public/meals').query(query);
const week = (agent) => meals({ from: TODAY, to: '2026-11-08' }, agent);

/** A slot with a menu (null = no menu). */
async function slot({ menu = null, ...fields }) {
  const created = await createSlot(fields);
  if (menu !== null) await slotDao.setMenu(await getDb(), created.id, menu);
  return created;
}

function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: expect.any(String) });
  if (message) expect(res.body.error).toBe(message);
  else expect(res.body.error.length).toBeGreaterThan(0);
}

beforeEach(async () => {
  await clearDb();
});

describe('GET /api/public/meals – 200', () => {
  it('answers a guest with every field of Meal, and nothing else (no seats, no tables, no status)', async () => {
    const lunch = await slot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Lunch', menu: POLENTA });

    const res = await week();

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: lunch.id,
        date: TOMORROW,
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
        past: false,
        menu: POLENTA,
      },
    ]);
  });

  it('gives a slot without a menu yet menu: null', async () => {
    await slot({ date: TOMORROW, label: 'Dinner' });

    const res = await week();

    expect(res.body).toEqual([expect.objectContaining({ label: 'Dinner', menu: null })]);
  });

  it('is public: guest, hiker, employee and warden get the same answer', async () => {
    await slot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Lunch', menu: POLENTA });
    await slot({ date: TOMORROW, label: 'Dinner' });
    const guest = await week();

    for (const role of ['hiker', 'employee', 'warden']) {
      const { agent } = await loggedIn(app, role);
      const res = await week(agent);
      expect(res.status, role).toBe(200);
      expect(res.body, role).toEqual(guest.body);
    }
  });

  it('lists only open slots: a closed slot is not a meal of the hut', async () => {
    await slot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    await slot({ date: TOMORROW, label: 'Closed dinner', status: 'closed', menu: 'Not served' });

    const res = await week();

    expect(res.body.map((m) => m.label)).toEqual(['Lunch']);
  });

  it('orders the meals by date, then start time', async () => {
    await slot({ date: '2026-11-04', startTime: '12:00', endTime: '14:00', label: 'Wed lunch' });
    await slot({ date: TOMORROW, startTime: '19:00', endTime: '20:30', label: 'Tue dinner' });
    await slot({ date: TOMORROW, startTime: '07:30', endTime: '09:00', label: 'Tue breakfast' });
    await slot({ date: TOMORROW, startTime: '12:00', endTime: '14:00', label: 'Tue lunch' });

    const res = await week();

    expect(res.body.map((m) => m.label)).toEqual(['Tue breakfast', 'Tue lunch', 'Tue dinner', 'Wed lunch']);
  });

  it('includes both ends of the range and nothing outside it', async () => {
    await slot({ date: '2026-11-09', label: 'Before' });
    await slot({ date: '2026-11-10', label: 'First day' });
    await slot({ date: '2026-11-16', label: 'Last day' });
    await slot({ date: '2026-11-17', label: 'After' });

    const res = await meals({ from: '2026-11-10', to: '2026-11-16' });

    expect(res.body.map((m) => m.label)).toEqual(['First day', 'Last day']);
  });

  it('answers an empty list for a range without meals', async () => {
    await slot({ date: TOMORROW, label: 'Dinner' });

    const res = await meals({ from: '2026-12-01', to: '2026-12-07' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('includes the started slots of the range with past: true (start at or before now)', async () => {
    await slot({ date: YESTERDAY, startTime: '19:00', endTime: '20:30', label: 'Yesterday dinner', menu: 'Risotto' });
    await slot({ date: TODAY, startTime: '07:30', endTime: '09:00', label: 'Breakfast' });
    await slot({ date: TODAY, startTime: '10:00', endTime: '11:00', label: 'Starting now' });
    await slot({ date: TODAY, startTime: '10:30', endTime: '11:30', label: 'In half an hour' });

    const res = await meals({ from: YESTERDAY, to: TODAY });

    expect(res.body.map(({ label, past }) => [label, past])).toEqual([
      ['Yesterday dinner', true],
      ['Breakfast', true],
      ['Starting now', true],
      ['In half an hour', false],
    ]);
    expect(res.body[0].menu).toBe('Risotto'); // a past slot keeps its menu
  });

  it('gives the menu exactly as saved: formatting marks and HTML are text, the client renders them', async () => {
    const html = '<b>Soup</b> <script>alert(1)</script>\n- *Strudel*';
    await slot({ date: TOMORROW, label: 'Dinner', menu: html });

    const res = await week();

    expect(res.body[0].menu).toBe(html);
  });

  it('accepts a one-day range and a whole month of 31 days', async () => {
    expect((await meals({ from: TOMORROW, to: TOMORROW })).status).toBe(200);
    expect((await meals({ from: '2026-12-01', to: '2026-12-31' })).status).toBe(200);
  });
});

describe('GET /api/public/meals – 400', () => {
  it('refuses a range longer than 31 days', async () => {
    expectError(await meals({ from: '2026-12-01', to: '2027-01-01' }), 400, 'The range cannot exceed 31 days');
  });

  it('refuses `to` before `from`', async () => {
    expectError(await meals({ from: '2026-11-08', to: '2026-11-02' }), 400);
  });

  it.each([
    ['from is missing', { to: '2026-11-08' }],
    ['to is missing', { from: TODAY }],
    ['both are missing', {}],
    ['from is not a calendar date', { from: '2026-02-30', to: '2026-03-05' }],
    ['to is not a calendar date', { from: '2026-11-25', to: '2026-11-31' }],
    ['from is not YYYY-MM-DD', { from: '2026-11-2', to: '2026-11-08' }],
    ['to has a time', { from: TODAY, to: '2026-11-08T10:00' }],
    ['from is text', { from: 'today', to: '2026-11-08' }],
  ])('refuses a request where %s', async (_case, query) => {
    expectError(await meals(query), 400);
  });

  it('refuses a date given twice', async () => {
    expectError(await request(app).get(`/api/public/meals?from=${TODAY}&from=${TOMORROW}&to=2026-11-08`), 400);
  });
});
