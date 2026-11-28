// MH-10 FT1 – mock of the menu endpoints (VITE_USE_MOCKS=true): the same rules as the server (docs/openapi.yaml).
//  setSlotMenu: 400 for a menu that is not a text or null, 404 for an unknown slot, 400 over 2000 characters, the
//  text is trimmed, '' / spaces / null clear it; 409 for any change on a slot that has started (PO rule: a menu
//  can be added, changed or removed only before its slot starts).
//  listPreviousMenus: filters ignoring case, each text once (with its most recent slot), most recent first, at most 20.
// The mock builds its slots around "now" when it loads: every test loads it again (vi.resetModules) with "now" =
// Wednesday 4 November 2026, 10:00. Then slots 1–4 (Mon 2 and Tue 3 Nov) have started, slots 5–9 (Wed 4 evening and
// Fri 6) have not; slots 2 and 4 start with a menu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date(2026, 10, 4, 10, 0);
const STARTED_WITHOUT_MENU = 1;
const STARTED_WITH_MENU = 2;
const NOT_STARTED = 5;
const NOT_STARTED_LAST = 9; // Fri 6 Nov 20:30, the latest slot of the week

let mock;
beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.resetModules();
  mock = await import('../../../../src/api/mocks/slots.js');
});
afterEach(() => vi.useRealTimers());

const allSlots = () => mock.listSlots('0000-01-01', '9999-12-31');
const slotWithId = async (id) => (await allSlots()).find((slot) => slot.id === id);

describe('mock slots around "now"', () => {
  it('slots 1–4 have started, 5–9 have not; 2 and 4 have a menu', async () => {
    const slots = await allSlots();
    expect(slots.filter((slot) => slot.past).map((slot) => slot.id)).toEqual([1, 2, 3, 4]);
    expect(slots.filter((slot) => slot.menu).map((slot) => slot.id)).toEqual([2, 4]);
    expect((await slotWithId(NOT_STARTED)).past).toBe(false);
  });
});

describe('mock setSlotMenu', () => {
  it.each([123, true, {}, ['Soup']])('400 "menu must be a text or null" for %j', async (menu) => {
    await expect(mock.setSlotMenu(NOT_STARTED, menu)).rejects.toMatchObject({
      status: 400,
      message: 'menu must be a text or null',
    });
    expect((await slotWithId(NOT_STARTED)).menu).toBeNull();
  });

  it('404 "Slot not found" for an unknown slot', async () => {
    await expect(mock.setSlotMenu(9999, 'Soup')).rejects.toMatchObject({ status: 404, message: 'Slot not found' });
  });

  it('400 over 2000 characters; exactly 2000 (spaces at the ends not counted) is saved', async () => {
    await expect(mock.setSlotMenu(NOT_STARTED, 'a'.repeat(2001))).rejects.toMatchObject({
      status: 400,
      message: 'The menu cannot exceed 2000 characters',
    });
    expect((await slotWithId(NOT_STARTED)).menu).toBeNull();

    await expect(mock.setSlotMenu(NOT_STARTED, ` ${'a'.repeat(2000)}\n`)).resolves.toMatchObject({
      id: NOT_STARTED,
      menu: 'a'.repeat(2000),
    });
  });

  it('saves the text trimmed, and answers the whole slot', async () => {
    const saved = await mock.setSlotMenu(NOT_STARTED, '  **Polenta**\n- Soup  ');
    const slot = await slotWithId(NOT_STARTED);

    expect(saved).toEqual(slot);
    expect(slot.menu).toBe('**Polenta**\n- Soup');
    expect(saved).toEqual(expect.objectContaining({ id: NOT_STARTED, date: '2026-11-04', tables: expect.any(Array) }));
  });

  it.each([['an empty text', ''], ['spaces only', '  \n '], ['null', null]])('%s clears the menu', async (_case, menu) => {
    await mock.setSlotMenu(NOT_STARTED, 'Soup');

    await expect(mock.setSlotMenu(NOT_STARTED, menu)).resolves.toMatchObject({ id: NOT_STARTED, menu: null });
    expect((await slotWithId(NOT_STARTED)).menu).toBeNull();
  });

  it.each([
    ['adding a menu', STARTED_WITHOUT_MENU, 'Soup'],
    ['changing the menu', STARTED_WITH_MENU, 'Barley soup'],
    ['removing the menu with null', STARTED_WITH_MENU, null],
    ['removing the menu with an empty text', STARTED_WITH_MENU, ''],
  ])('409 on a slot that has started: %s, and the menu stays as it was', async (_case, id, menu) => {
    const before = (await slotWithId(id)).menu;

    await expect(mock.setSlotMenu(id, menu)).rejects.toMatchObject({
      status: 409,
      message: 'The menu of a slot that has started cannot be changed',
    });
    expect((await slotWithId(id)).menu).toBe(before);
  });
});

describe('mock listPreviousMenus', () => {
  it('lists { menu, slotId, date, startTime, label }, the most recent slot first, also the slots that have started', async () => {
    await mock.setSlotMenu(NOT_STARTED, 'Barley soup');
    const menus = await mock.listPreviousMenus();

    expect(menus.map(({ slotId }) => slotId)).toEqual([NOT_STARTED, 4, 2]);
    for (const previous of menus) {
      const slot = await slotWithId(previous.slotId);
      expect(previous).toEqual({
        menu: slot.menu,
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        label: slot.label,
      });
    }
  });

  it('filters by text, ignoring case; no match gives []', async () => {
    await mock.setSlotMenu(NOT_STARTED, '**Gnocchi alla sorrentina** with basil');
    await mock.setSlotMenu(6, 'Canederli in broth');

    expect((await mock.listPreviousMenus('  ALLA SORRENTINA ')).map(({ slotId }) => slotId)).toEqual([NOT_STARTED]);
    expect((await mock.listPreviousMenus('CANEDERLI')).map(({ slotId }) => slotId)).toEqual([6]);
    expect(await mock.listPreviousMenus('caviar')).toEqual([]);
  });

  it('each text once, with its most recent slot', async () => {
    await mock.setSlotMenu(NOT_STARTED, 'Same menu');
    await mock.setSlotMenu(NOT_STARTED_LAST, 'Same menu');

    expect(await mock.listPreviousMenus('same menu')).toEqual([expect.objectContaining({ slotId: NOT_STARTED_LAST })]);
  });

  it('at most 20, the most recent first', async () => {
    for (let day = 1; day <= 25; day++) {
      const date = `2099-01-${String(day).padStart(2, '0')}`;
      const created = await mock.createSlot({ date, startTime: '12:00', endTime: '13:00', label: 'Lunch', tables: [{ name: 'T1', seats: 4 }] });
      await mock.setSlotMenu(created.id, `Menu of ${date}`);
    }

    const menus = await mock.listPreviousMenus('menu of 2099');

    expect(menus).toHaveLength(20);
    expect(menus[0]).toMatchObject({ menu: 'Menu of 2099-01-25', date: '2099-01-25' });
    expect(menus.at(-1)).toMatchObject({ date: '2099-01-06' });
  });
});
