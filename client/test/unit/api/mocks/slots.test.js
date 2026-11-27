// MH-10 FT1 – mock of the menu endpoints (VITE_USE_MOCKS=true): the same rules as the server (docs/openapi.yaml).
//  setSlotMenu: 404 for an unknown slot, 400 over 2000 characters, the text is trimmed, '' / spaces / null clear it.
//  listPreviousMenus: filters ignoring case, each text once (with its most recent slot), most recent first, at most 20.
// The mock keeps its slots in memory and builds them around today: every test loads it again (vi.resetModules), and
// the checks use the slots it lists rather than fixed dates.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mock;
beforeEach(async () => {
  vi.resetModules();
  mock = await import('../../../../src/api/mocks/slots.js');
});

const allSlots = () => mock.listSlots('0000-01-01', '9999-12-31');
const slotWithId = async (id) => (await allSlots()).find((slot) => slot.id === id);

describe('mock setSlotMenu', () => {
  it('404 "Slot not found" for an unknown slot', async () => {
    await expect(mock.setSlotMenu(9999, 'Soup')).rejects.toMatchObject({ status: 404, message: 'Slot not found' });
  });

  it('400 over 2000 characters; exactly 2000 (spaces at the ends not counted) is saved', async () => {
    await expect(mock.setSlotMenu(1, 'a'.repeat(2001))).rejects.toMatchObject({
      status: 400,
      message: 'The menu cannot exceed 2000 characters',
    });
    expect((await slotWithId(1)).menu).toBeNull();

    await expect(mock.setSlotMenu(1, ` ${'a'.repeat(2000)}\n`)).resolves.toMatchObject({ id: 1, menu: 'a'.repeat(2000) });
  });

  it('saves the text trimmed, and answers the whole slot', async () => {
    const saved = await mock.setSlotMenu(1, '  **Polenta**\n- Soup  ');
    const slot = await slotWithId(1);

    expect(saved).toEqual(slot);
    expect(slot.menu).toBe('**Polenta**\n- Soup');
    expect(saved).toEqual(expect.objectContaining({ id: 1, date: expect.any(String), tables: expect.any(Array) }));
  });

  it.each([['an empty text', ''], ['spaces only', '  \n '], ['null', null]])('%s clears the menu', async (_case, menu) => {
    expect((await slotWithId(2)).menu).not.toBeNull(); // the mock starts with a menu on slot 2

    await expect(mock.setSlotMenu(2, menu)).resolves.toMatchObject({ id: 2, menu: null });
    expect((await slotWithId(2)).menu).toBeNull();
  });
});

describe('mock listPreviousMenus', () => {
  it('lists { menu, slotId, date, startTime, label }, the most recent slot first', async () => {
    const menus = await mock.listPreviousMenus();
    expect(menus.length).toBeGreaterThan(0);
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
    const order = menus.map(({ date, startTime }) => `${date} ${startTime}`);
    expect(order).toEqual([...order].sort().reverse());
  });

  it('filters by text, ignoring case; no match gives []', async () => {
    await mock.setSlotMenu(1, '**Gnocchi alla sorrentina** with basil');
    await mock.setSlotMenu(3, 'Canederli in broth');

    expect((await mock.listPreviousMenus('  ALLA SORRENTINA ')).map(({ slotId }) => slotId)).toEqual([1]);
    expect((await mock.listPreviousMenus('CANEDERLI')).map(({ slotId }) => slotId)).toEqual([3]);
    expect(await mock.listPreviousMenus('caviar')).toEqual([]);
  });

  it('each text once, with its most recent slot', async () => {
    const slots = await allSlots();
    const [first, , , last] = slots; // the list is in time order
    await mock.setSlotMenu(first.id, 'Same menu');
    await mock.setSlotMenu(last.id, 'Same menu');

    const same = (await mock.listPreviousMenus('same menu')).filter(({ menu }) => menu === 'Same menu');
    expect(same).toEqual([expect.objectContaining({ slotId: last.id })]);
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
