// MH-10 BT1 – integration tests of the menu endpoints, written from the story, the PO answers and docs/openapi.yaml
// ("Menus", Slot, PreviousMenu): team rule, tests come from the contract, not from the code.
// Real app, real SQLite (temporary DB from setupTestDb.js), real sessions; data through the DAOs, fixed clock.
//
//   PUT /api/slots/{id}/menu { menu }   staff only (employee, warden):
//     200 Slot (same shape as GET /api/slots, menu included) · 400 bad id or menu · 401 · 403 · 404 unknown slot
//     · 409 the slot has started (PO rule: a menu can be added, changed or removed only before its slot starts)
//   GET /api/slots/menus?q=   staff only: 200 [PreviousMenu] (each text once with its most recent slot, the most
//     recent first, at most 20; q filters ignoring case) · 400 q too long · 401 · 403
// Checked through GET /api/slots: only the slot written changes (a menu reused on two slots is changed on one only),
// a refused change leaves the menu as it was, and copying a week does not copy the menus.
// The validation rules themselves are in test/unit/slots/menus.test.js.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import { clearDb, createSlot, loggedIn } from '../helpers/bookingApi.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now": Wednesday 4 Nov 2026, 10:00 in the hut. This week: Mon 2 – Sun 8 Nov; next week: Mon 9 – Sun 15 Nov.
const THIS_WEEK = '2026-11-02';
const NEXT_WEEK = '2026-11-09';
const AFTER_NEXT = '2026-11-16';
useFixedClock('2026-11-04T10:00');

const app = createApp();
const STARTED_MESSAGE = 'The menu of a slot that has started cannot be changed';

// ---------- data helpers (shared ones in helpers/bookingApi.js: tests never depend on the demo seed) ----------

/** The session agent of a new logged-in user of `role`. */
const staffAgent = async (role) => (await loggedIn(app, role)).agent;

/** A lunch of Tue 10 Nov with tables T1 (4) and T2 (6) unless told otherwise; `menu` is then written by the DAO. */
async function insertSlot({ menu = null, ...slot } = {}) {
  const created = await createSlot({ date: '2026-11-10', startTime: '12:00', endTime: '14:00', label: 'Lunch', seats: [4, 6], ...slot });
  return menu === null ? created : slotDao.setMenu(await getDb(), created.id, menu);
}

const putMenu = (agent, id, body) => agent.put(`/api/slots/${id}/menu`).send(body);
const listMenus = (agent, query = '') => agent.get(`/api/slots/menus${query}`);

/** The slots of the week of `monday` (Mon–Sun), as GET /api/slots answers them. */
async function listWeek(agent, monday) {
  const [year, month, day] = monday.split('-').map(Number);
  const sunday = new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10);
  const { status, body } = await agent.get('/api/slots').query({ from: monday, to: sunday });
  expect(status).toBe(200);
  return body;
}
const menuOf = async (agent, monday, id) => (await listWeek(agent, monday)).find((slot) => slot.id === id).menu;

/** An error answer: the status and the openapi Error body { error: "…" }, with `message` when given. */
const expectError = (res, status, message) =>
  expect({ status: res.status, body: res.body }).toEqual({ status, body: { error: message ?? expect.stringMatching(/\S/) } });

let employee;
beforeEach(async () => {
  await clearDb();
  employee = await staffAgent('employee');
});

// ---------- PUT /api/slots/{id}/menu ----------

describe('PUT /api/slots/{id}/menu – 200', () => {
  it.each(['employee', 'warden'])('the %s saves a menu and gets the whole Slot, as GET /api/slots shows it', async (role) => {
    const agent = role === 'employee' ? employee : await staffAgent(role);
    const slot = await insertSlot();

    const res = await putMenu(agent, slot.id, { menu: '  **Polenta** with mushrooms\n- Apple strudel  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: slot.id,
      date: '2026-11-10',
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      status: 'open',
      past: false,
      menu: '**Polenta** with mushrooms\n- Apple strudel',
      tables: [
        { id: expect.any(Number), name: 'T1', seats: 4 },
        { id: expect.any(Number), name: 'T2', seats: 6 },
      ],
    });
    expect((await listWeek(agent, NEXT_WEEK)).find(({ id }) => id === slot.id)).toEqual(res.body);
  });

  it.each([
    ['an empty text', ''],
    ['spaces only', '   '],
    ['null', null],
  ])('%s clears the menu: menu is null', async (_case, menu) => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    const res = await putMenu(employee, slot.id, { menu });

    expect(res.status).toBe(200);
    expect(res.body.menu).toBeNull();
    expect(await menuOf(employee, NEXT_WEEK, slot.id)).toBeNull();
  });

  it('accepts exactly 2000 characters after trimming', async () => {
    const slot = await insertSlot();
    const text = 'a'.repeat(2000);

    const res = await putMenu(employee, slot.id, { menu: ` ${text} ` });

    expect(res.status).toBe(200);
    expect(res.body.menu).toBe(text);
  });

  it('changes only that slot: the other slots of the week keep their menu', async () => {
    const lunch = await insertSlot({ menu: 'Barley soup' });
    const dinner = await insertSlot({ startTime: '19:00', endTime: '20:30', label: 'Dinner' });

    await putMenu(employee, dinner.id, { menu: 'Venison stew' });

    const week = await listWeek(employee, NEXT_WEEK);
    expect(week.map(({ id, menu }) => ({ id, menu }))).toEqual([
      { id: lunch.id, menu: 'Barley soup' },
      { id: dinner.id, menu: 'Venison stew' },
    ]);
  });

  it('a menu reused on two slots: changing it on one slot keeps the other slot\'s menu', async () => {
    const first = await insertSlot({ menu: 'Barley soup\n- Apple strudel' });
    const second = await insertSlot({ date: '2026-11-11', menu: 'Barley soup\n- Apple strudel' });

    const res = await putMenu(employee, second.id, { menu: 'Barley soup\n- Blueberry tart' });

    expect(res.status).toBe(200);
    expect(await menuOf(employee, NEXT_WEEK, first.id)).toBe('Barley soup\n- Apple strudel');
    expect(await menuOf(employee, NEXT_WEEK, second.id)).toBe('Barley soup\n- Blueberry tart');
  });

  it('a slot that starts later today can still be changed', async () => {
    const slot = await insertSlot({ date: '2026-11-04', startTime: '19:00', endTime: '20:30', label: 'Dinner' });

    const res = await putMenu(employee, slot.id, { menu: 'Barley soup' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ menu: 'Barley soup', past: false });
  });
});

describe('PUT /api/slots/{id}/menu – errors', () => {
  it('401 for a guest', async () => {
    const slot = await insertSlot();
    expectError(await putMenu(request(app), slot.id, { menu: 'Soup' }), 401, 'Not logged in');
    expect(await menuOf(employee, NEXT_WEEK, slot.id)).toBeNull();
  });

  it('403 "Staff only" for a hiker', async () => {
    const slot = await insertSlot();
    expectError(await putMenu(await staffAgent('hiker'), slot.id, { menu: 'Soup' }), 403, 'Staff only');
    expect(await menuOf(employee, NEXT_WEEK, slot.id)).toBeNull();
  });

  it.each(['0', '-1', 'abc', '1.5', '1e3', '99999999999999999999'])(
    '400 "id must be a positive integer" for the id %s',
    async (id) => {
      expectError(await putMenu(employee, id, { menu: 'Soup' }), 400, 'id must be a positive integer');
    },
  );

  it('404 "Slot not found" for an unknown id', async () => {
    expectError(await putMenu(employee, 999_999, { menu: 'Soup' }), 404, 'Slot not found');
  });

  it.each([
    ['without menu', {}],
    ['with a number', { menu: 123 }],
    ['with an object', { menu: { text: 'Soup' } }],
    ['with an array', { menu: ['Soup'] }],
  ])('400 "menu must be a text or null" for a body %s, and the menu stays the same', async (_case, body) => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    expectError(await putMenu(employee, slot.id, body), 400, 'menu must be a text or null');
    expect(await menuOf(employee, NEXT_WEEK, slot.id)).toBe('Barley soup');
  });

  it('400 for a request without a body', async () => {
    const slot = await insertSlot();
    expectError(await employee.put(`/api/slots/${slot.id}/menu`), 400);
  });

  it('400 "The menu cannot exceed 2000 characters" for 2001 characters, and the menu stays the same', async () => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    expectError(await putMenu(employee, slot.id, { menu: 'a'.repeat(2001) }), 400, 'The menu cannot exceed 2000 characters');
    expect(await menuOf(employee, NEXT_WEEK, slot.id)).toBe('Barley soup');
  });
});

describe('PUT /api/slots/{id}/menu – 409 on a slot that has started (PO rule)', () => {
  const STARTED = [
    ['started earlier today', { date: '2026-11-04', startTime: '08:00', endTime: '09:30', label: 'Breakfast' }],
    ['of a past day', { date: '2026-11-03', startTime: '19:00', endTime: '20:30', label: 'Dinner' }],
  ];

  it.each(STARTED)('a slot %s: adding a menu → 409, GET /api/slots still shows no menu', async (_case, slotData) => {
    const slot = await insertSlot(slotData);

    expectError(await putMenu(employee, slot.id, { menu: 'Barley soup' }), 409, STARTED_MESSAGE);
    expect(await menuOf(employee, THIS_WEEK, slot.id)).toBeNull();
  });

  it.each(STARTED)('a slot %s: changing or removing the menu → 409, the menu stays the same', async (_case, slotData) => {
    const slot = await insertSlot({ ...slotData, menu: 'Barley soup' });

    expectError(await putMenu(employee, slot.id, { menu: 'Venison stew' }), 409, STARTED_MESSAGE);
    expectError(await putMenu(employee, slot.id, { menu: null }), 409, STARTED_MESSAGE);
    expectError(await putMenu(employee, slot.id, { menu: '' }), 409, STARTED_MESSAGE);
    expect(await menuOf(employee, THIS_WEEK, slot.id)).toBe('Barley soup');
  });
});

// ---------- GET /api/slots/menus ----------

describe('GET /api/slots/menus', () => {
  it.each(['employee', 'warden'])('the %s gets the PreviousMenu list: each text once with its most recent slot, the most recent first', async (role) => {
    const agent = role === 'employee' ? employee : await staffAgent(role);
    await insertSlot({ date: '2026-11-10', menu: 'Barley soup' });
    const newer = await insertSlot({ date: '2026-11-12', menu: 'Barley soup' });
    const dinner = await insertSlot({ date: '2026-11-10', startTime: '19:00', endTime: '20:30', label: 'Dinner', menu: 'Venison stew' });
    const past = await insertSlot({ date: '2026-11-03', menu: 'Pumpkin soup' });
    await insertSlot({ date: '2026-11-13' }); // no menu

    const res = await listMenus(agent);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { menu: 'Barley soup', slotId: newer.id, date: '2026-11-12', startTime: '12:00', label: 'Lunch' },
      { menu: 'Venison stew', slotId: dinner.id, date: '2026-11-10', startTime: '19:00', label: 'Dinner' },
      { menu: 'Pumpkin soup', slotId: past.id, date: '2026-11-03', startTime: '12:00', label: 'Lunch' },
    ]);
  });

  it('an empty list when no menu has been written', async () => {
    await insertSlot();
    const res = await listMenus(employee);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('at most 20 texts, the most recent ones', async () => {
    // 22 lunches with a menu each, 1–22 Dec.
    const dates = Array.from({ length: 22 }, (_, index) => new Date(Date.UTC(2026, 11, index + 1)).toISOString().slice(0, 10));
    for (const [index, date] of dates.entries()) await insertSlot({ date, menu: `Menu of day ${index + 1}` });

    const res = await listMenus(employee);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(20);
    expect(res.body[0].menu).toBe('Menu of day 22');
    expect(res.body.at(-1).menu).toBe('Menu of day 3');
  });

  it('q keeps the texts that contain it, trimmed and ignoring upper and lower case', async () => {
    await insertSlot({ date: '2026-11-10', menu: '**Polenta** with mushrooms' });
    await insertSlot({ date: '2026-11-11', menu: 'Venison stew with POLENTA' });
    await insertSlot({ date: '2026-11-12', menu: 'Barley soup' });

    const res = await listMenus(employee, `?q=${encodeURIComponent('  polenta ')}`);

    expect(res.status).toBe(200);
    expect(res.body.map(({ menu }) => menu)).toEqual(['Venison stew with POLENTA', '**Polenta** with mushrooms']);
    expect((await listMenus(employee, '?q=caviar')).body).toEqual([]);
  });

  it('an empty q lists everything', async () => {
    await insertSlot({ menu: 'Barley soup' });
    const res = await listMenus(employee, '?q=');
    expect(res.status).toBe(200);
    expect(res.body.map(({ menu }) => menu)).toEqual(['Barley soup']);
  });

  it('accepts a q of exactly 100 characters', async () => {
    const res = await listMenus(employee, `?q=${'a'.repeat(100)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('400 "q cannot exceed 100 characters" for a longer q', async () => {
    expectError(await listMenus(employee, `?q=${'a'.repeat(101)}`), 400, 'q cannot exceed 100 characters');
  });

  it('400 for q given twice', async () => {
    expectError(await listMenus(employee, '?q=soup&q=stew'), 400);
  });

  it('401 for a guest', async () => {
    expectError(await listMenus(request(app)), 401, 'Not logged in');
  });

  it('403 "Staff only" for a hiker', async () => {
    expectError(await listMenus(await staffAgent('hiker')), 403, 'Staff only');
  });

  it('"menus" is not taken as a slot id', async () => {
    await insertSlot({ menu: 'Barley soup' });
    const res = await listMenus(employee);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expectError(await putMenu(employee, 'menus', { menu: 'Soup' }), 400, 'id must be a positive integer');
  });
});

// ---------- copy week ----------

describe('copy week and menus', () => {
  it('copying a week does not copy the menus: the copies have menu null, the source keeps its menus', async () => {
    const source = await insertSlot({ date: '2026-11-10', menu: 'Barley soup' });

    const res = await employee.post('/api/slots/copy-week').send({ sourceWeek: NEXT_WEEK, targetWeek: AFTER_NEXT });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0]).toMatchObject({ date: '2026-11-17', label: 'Lunch', menu: null });
    expect((await listWeek(employee, AFTER_NEXT)).map(({ menu }) => menu)).toEqual([null]);
    expect(await menuOf(employee, NEXT_WEEK, source.id)).toBe('Barley soup');
  });
});
