// MH-10 BT1 – unit tests of setSlotMenu() and listPreviousMenus() (services/slotService.js), written from the story,
// the PO answers and docs/openapi.yaml ("Menus", PUT /api/slots/{id}/menu, GET /api/slots/menus): team rule, tests
// come from the contract, not from the code. The DAO queries themselves are in test/unit/db/dao.test.js.
// setSlotMenu:
// - the text is saved trimmed; '', spaces only and null clear it (null is stored);
// - at most 2000 characters after trimming (2001 → 400); anything but a text or null → 400; unknown slot → 404;
// - PO rule: a menu can be added, changed or removed only before its slot starts: on a slot that has started
//   (earlier today, right now, on a past day) → 409 and the stored menu stays the same; later today is still fine.
// listPreviousMenus:
// - no query or a blank one → every text once, with its most recent slot, the most recent first, at most 20;
// - the query is trimmed and matches ignoring case; at most 100 characters after trimming; not a text → 400.
// Real temporary SQLite database (setupTestDb.js), data through the DAOs, fixed clock.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import { listPreviousMenus, setSlotMenu } from '../../../src/services/slotService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now": Wednesday 4 Nov 2026, 10:00 in the hut.
useFixedClock('2026-11-04T10:00');

const TOMORROW = '2026-11-05';
const TODAY = '2026-11-04';
const YESTERDAY = '2026-11-03';

let db;

beforeEach(async () => {
  db = await getDb();
  for (const table of ['booking_tables', 'bookings', 'slot_tables', 'slots']) await db.run(`DELETE FROM ${table}`);
});

// ---------- data helpers (through the DAOs) ----------

async function insertSlot({ date = TOMORROW, startTime = '12:00', endTime = '14:00', label = 'Lunch', menu = null } = {}) {
  const slot = await slotDao.create(db, { date, startTime, endTime, label, tables: [{ name: 'T1', seats: 4 }] });
  return menu === null ? slot : slotDao.setMenu(db, slot.id, menu);
}

const storedMenu = async (id) => (await slotDao.findById(db, id)).menu;

/** Runs `promise` and checks it fails with `status` and, when given, `message`. */
async function expectFailure(promise, status, message) {
  const error = await promise.then(
    () => null,
    (failure) => failure,
  );
  expect(error, 'the call should fail').not.toBeNull();
  expect(error.status).toBe(status);
  if (message) expect(error.message).toBe(message);
}

// ---------- setSlotMenu ----------

describe('setSlotMenu: saving and clearing', () => {
  it('saves the text without the spaces at the ends and answers the whole slot', async () => {
    const slot = await insertSlot();

    const saved = await setSlotMenu(slot.id, '  **Polenta** with mushrooms\n- Apple strudel \n');

    expect(saved).toEqual({ ...slot, menu: '**Polenta** with mushrooms\n- Apple strudel' });
    await expect(storedMenu(slot.id)).resolves.toBe('**Polenta** with mushrooms\n- Apple strudel');
  });

  it('changes a menu already there', async () => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    await expect(setSlotMenu(slot.id, 'Venison stew')).resolves.toMatchObject({ id: slot.id, menu: 'Venison stew' });
    await expect(storedMenu(slot.id)).resolves.toBe('Venison stew');
  });

  it.each([
    ['an empty text', ''],
    ['spaces only', '   \n\t '],
    ['null', null],
  ])('%s clears the menu: null is stored', async (_case, menu) => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    await expect(setSlotMenu(slot.id, menu)).resolves.toMatchObject({ id: slot.id, menu: null });
    await expect(storedMenu(slot.id)).resolves.toBeNull();
  });

  it('accepts exactly 2000 characters after trimming', async () => {
    const slot = await insertSlot();
    const text = 'a'.repeat(2000);

    await expect(setSlotMenu(slot.id, `  ${text}\n`)).resolves.toMatchObject({ menu: text });
  });

  it('refuses 2001 characters with 400, and the menu stays the same', async () => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    await expectFailure(setSlotMenu(slot.id, 'a'.repeat(2001)), 400, 'The menu cannot exceed 2000 characters');
    await expect(storedMenu(slot.id)).resolves.toBe('Barley soup');
  });

  it.each([
    ['a number', 123],
    ['true', true],
    ['an object', { text: 'Soup' }],
    ['an array', ['Soup']],
    ['missing', undefined],
  ])('refuses a menu that is %s with 400 "menu must be a text or null"', async (_case, menu) => {
    const slot = await insertSlot({ menu: 'Barley soup' });

    await expectFailure(setSlotMenu(slot.id, menu), 400, 'menu must be a text or null');
    await expect(storedMenu(slot.id)).resolves.toBe('Barley soup');
  });

  it('answers 404 "Slot not found" for an unknown slot', async () => {
    await expectFailure(setSlotMenu(999_999, 'Soup'), 404, 'Slot not found');
  });
});

describe('setSlotMenu: only before the slot starts (PO rule)', () => {
  const STARTED = [
    ['a slot that started earlier today', { date: TODAY, startTime: '08:00', endTime: '09:30', label: 'Breakfast' }],
    ['a slot that starts right now', { date: TODAY, startTime: '10:00', endTime: '11:00', label: 'Brunch' }],
    ['a slot of a past day', { date: YESTERDAY, startTime: '19:00', endTime: '20:30', label: 'Dinner' }],
  ];
  const message = 'The menu of a slot that has started cannot be changed';

  it.each(STARTED)('adding a menu to %s → 409, still no menu', async (_case, slotData) => {
    const slot = await insertSlot(slotData);

    await expectFailure(setSlotMenu(slot.id, 'Barley soup'), 409, message);
    await expect(storedMenu(slot.id)).resolves.toBeNull();
  });

  it.each(STARTED)('changing the menu of %s → 409, the menu stays the same', async (_case, slotData) => {
    const slot = await insertSlot({ ...slotData, menu: 'Barley soup' });

    await expectFailure(setSlotMenu(slot.id, 'Venison stew'), 409, message);
    await expect(storedMenu(slot.id)).resolves.toBe('Barley soup');
  });

  it.each(STARTED)('removing the menu of %s → 409, the menu stays the same', async (_case, slotData) => {
    const slot = await insertSlot({ ...slotData, menu: 'Barley soup' });

    await expectFailure(setSlotMenu(slot.id, null), 409, message);
    await expectFailure(setSlotMenu(slot.id, '  '), 409, message);
    await expect(storedMenu(slot.id)).resolves.toBe('Barley soup');
  });

  it('a slot that starts later today can still be given, changed and cleared a menu', async () => {
    const slot = await insertSlot({ date: TODAY, startTime: '19:00', endTime: '20:30', label: 'Dinner' });

    await expect(setSlotMenu(slot.id, 'Barley soup')).resolves.toMatchObject({ menu: 'Barley soup' });
    await expect(setSlotMenu(slot.id, 'Venison stew')).resolves.toMatchObject({ menu: 'Venison stew' });
    await expect(setSlotMenu(slot.id, null)).resolves.toMatchObject({ menu: null });
  });
});

// ---------- listPreviousMenus ----------

describe('listPreviousMenus', () => {
  it.each([
    ['no query', undefined],
    ['an empty query', ''],
    ['a blank query', '   '],
  ])('%s lists every text once, with its most recent slot, the most recent first', async (_case, query) => {
    const older = await insertSlot({ date: '2026-11-05', menu: 'Barley soup' });
    const newer = await insertSlot({ date: '2026-11-06', menu: 'Barley soup' }); // same text, more recent
    const other = await insertSlot({ date: '2026-11-05', startTime: '19:00', endTime: '20:30', label: 'Dinner', menu: 'Venison stew' });
    await insertSlot({ date: '2026-11-07' }); // no menu: not listed

    const menus = await listPreviousMenus(query);

    expect(menus).toEqual([
      { menu: 'Barley soup', slotId: newer.id, date: '2026-11-06', startTime: '12:00', label: 'Lunch' },
      { menu: 'Venison stew', slotId: other.id, date: '2026-11-05', startTime: '19:00', label: 'Dinner' },
    ]);
    expect(menus.map(({ slotId }) => slotId)).not.toContain(older.id);
  });

  it('lists at most 20 texts, the most recent ones', async () => {
    for (let day = 1; day <= 22; day++) {
      await insertSlot({ date: `2026-12-${String(day).padStart(2, '0')}`, menu: `Menu of day ${day}` });
    }

    const menus = await listPreviousMenus();

    expect(menus).toHaveLength(20);
    expect(menus[0]).toMatchObject({ menu: 'Menu of day 22', date: '2026-12-22' });
    expect(menus.at(-1)).toMatchObject({ menu: 'Menu of day 3', date: '2026-12-03' });
  });

  it('includes the menus of slots that have started', async () => {
    const past = await insertSlot({ date: YESTERDAY, menu: 'Barley soup' });

    await expect(listPreviousMenus()).resolves.toEqual([expect.objectContaining({ slotId: past.id })]);
  });

  it('the query is trimmed and matches ignoring upper and lower case', async () => {
    await insertSlot({ date: '2026-11-05', menu: '**Polenta** with mushrooms' });
    await insertSlot({ date: '2026-11-06', menu: 'Venison stew with POLENTA' });
    await insertSlot({ date: '2026-11-07', menu: 'Barley soup' });

    const menus = await listPreviousMenus('  polenta \n');

    expect(menus.map(({ menu }) => menu)).toEqual(['Venison stew with POLENTA', '**Polenta** with mushrooms']);
    await expect(listPreviousMenus('caviar')).resolves.toEqual([]);
  });

  it('accepts exactly 100 characters after trimming', async () => {
    await expect(listPreviousMenus(`  ${'a'.repeat(100)}  `)).resolves.toEqual([]);
  });

  it('refuses more than 100 characters after trimming with 400 "q cannot exceed 100 characters"', async () => {
    await expectFailure(listPreviousMenus('a'.repeat(101)), 400, 'q cannot exceed 100 characters');
  });

  it.each([
    ['a number', 5],
    ['an array (q given twice)', ['soup', 'stew']],
    ['an object', { text: 'soup' }],
    ['null', null],
  ])('refuses a query that is %s with 400', async (_case, query) => {
    await expectFailure(listPreviousMenus(query), 400);
  });
});
