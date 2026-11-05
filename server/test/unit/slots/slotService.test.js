// MH-02 BT1 – unit tests of services/slotService.js: hasStarted and the rules of createSlot, with a fixed
// clock and the temporary DB of setupTestDb.js. The checks on the body format (date, times, label) are in
// routes/slots.js, so they are tested by the integration tests (test/integration/slotsApi.test.js).
import { beforeEach, describe, expect, it } from 'vitest';
import { setNow } from '../../../src/clock.js';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import { createSlot, hasStarted } from '../../../src/services/slotService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut.
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
const YESTERDAY = '2026-11-01';
useFixedClock(`${TODAY}T10:00`);

const MESSAGES = {
  endBeforeStart: 'endTime must be after startTime',
  slotStarted: 'Slot must start in the future',
  noTables: 'A slot needs at least one table',
  invalidTable: 'Each table needs a name and a positive number of seats',
  duplicateTableNames: 'Table names must be unique within the slot',
  overlap: 'Overlaps an existing slot',
};

let db;

beforeEach(async () => {
  db = await getDb();
  await db.run('DELETE FROM slots'); // slot_tables: ON DELETE CASCADE
});

/** A valid input of createSlot; `changes` replaces some fields. */
function newSlot(changes = {}) {
  return {
    date: TOMORROW,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner',
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 6 },
    ],
    ...changes,
  };
}

/** A slot already in the database, saved without the rules of createSlot. */
function existingSlot(changes = {}) {
  return slotDao.create(db, newSlot(changes));
}

const slotCount = async () => (await db.get('SELECT COUNT(*) AS n FROM slots')).n;
const tableCount = async () => (await db.get('SELECT COUNT(*) AS n FROM slot_tables')).n;

describe('hasStarted', () => {
  it.each([
    ['one minute ago', TODAY, '09:59', true],
    ['exactly now', TODAY, '10:00', true],
    ['in one minute', TODAY, '10:01', false],
    ['yesterday, at a later hour', YESTERDAY, '23:00', true],
    ['tomorrow, at an earlier hour', TOMORROW, '08:00', false],
  ])('a slot starting %s', (_case, date, startTime, expected) => {
    expect(hasStarted({ date, startTime })).toBe(expected);
  });

  it('follows the clock: the same slot starts when its time arrives', () => {
    const slot = { date: TODAY, startTime: '12:00' };
    expect(hasStarted(slot)).toBe(false);
    setNow(`${TODAY}T12:00`);
    expect(hasStarted(slot)).toBe(true);
  });
});

describe('createSlot', () => {
  it('saves the slot with its tables and returns it', async () => {
    const created = await createSlot(newSlot());

    expect(created).toEqual({
      id: expect.any(Number),
      date: TOMORROW,
      startTime: '19:00',
      endTime: '20:30',
      label: 'Dinner',
      status: 'open',
      tables: [
        { id: expect.any(Number), name: 'T1', seats: 4 },
        { id: expect.any(Number), name: 'T2', seats: 6 },
      ],
    });
    expect(await slotDao.findById(db, created.id)).toEqual(created);
  });

  it('removes the spaces around the label and the table names', async () => {
    const created = await createSlot(newSlot({ label: '  Dinner  ', tables: [{ name: '  T1 ', seats: 4 }] }));
    expect(created.label).toBe('Dinner');
    expect(created.tables[0].name).toBe('T1');
  });

  describe('overlap with the other slots of the day', () => {
    it.each([
      ['starts inside it (planning: 12–13 vs 12:30–14)', '12:00', '13:00', '12:30', '14:00'],
      ['ends inside it', '12:30', '14:00', '12:00', '13:00'],
      ['is inside it', '12:00', '14:00', '12:30', '13:00'],
      ['contains it', '12:30', '13:00', '12:00', '14:00'],
      ['has the same times', '12:00', '14:00', '12:00', '14:00'],
      ['shares one minute at its end', '12:00', '14:00', '11:00', '12:01'],
      ['shares one minute at its start', '12:00', '14:00', '13:59', '15:00'],
    ])('refuses a slot that %s with 409', async (_case, existingStart, existingEnd, startTime, endTime) => {
      await existingSlot({ startTime: existingStart, endTime: existingEnd });

      await expect(createSlot(newSlot({ startTime, endTime }))).rejects.toMatchObject({
        status: 409,
        message: MESSAGES.overlap,
      });
    });

    it.each([
      ['right after it (planning: 19–20:30 vs 20:30–22)', '20:30', '22:00'],
      ['right before it', '17:30', '19:00'],
      ['later the same day', '21:00', '22:00'],
    ])('accepts a turn %s', async (_case, startTime, endTime) => {
      await existingSlot({ startTime: '19:00', endTime: '20:30' });
      await expect(createSlot(newSlot({ startTime, endTime }))).resolves.toMatchObject({ startTime, endTime });
    });

    it('accepts the same times on another day', async () => {
      await existingSlot({ date: TOMORROW });
      await expect(createSlot(newSlot({ date: '2026-11-04' }))).resolves.toMatchObject({ date: '2026-11-04' });
    });

    it('compares the new slot with every slot of the day, not only the first one', async () => {
      await existingSlot({ startTime: '12:00', endTime: '14:00' });
      await existingSlot({ startTime: '19:00', endTime: '20:30' });
      await expect(createSlot(newSlot({ startTime: '20:00', endTime: '21:00' }))).rejects.toMatchObject({
        status: 409,
      });
    });

    it('counts a closed slot too: it still exists', async () => {
      await existingSlot({ status: 'closed' });
      await expect(createSlot(newSlot())).rejects.toMatchObject({ status: 409, message: MESSAGES.overlap });
    });

    it('saves nothing when the slot is refused, tables included', async () => {
      await existingSlot();
      await expect(createSlot(newSlot())).rejects.toMatchObject({ status: 409 });
      expect(await slotCount()).toBe(1);
      expect(await tableCount()).toBe(2);
    });

    it('two overlapping slots created at the same time: one is saved, the other gets 409', async () => {
      const results = await Promise.allSettled([
        createSlot(newSlot({ startTime: '19:00', endTime: '20:30' })),
        createSlot(newSlot({ startTime: '20:00', endTime: '21:30' })),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({
        status: 409,
        message: MESSAGES.overlap,
      });
      expect(await slotCount()).toBe(1);
    });
  });

  describe('times', () => {
    it.each([
      ['before the start', '20:00', '19:00'],
      ['equal to the start', '19:00', '19:00'],
    ])('refuses an end %s with 400', async (_case, startTime, endTime) => {
      await expect(createSlot(newSlot({ startTime, endTime }))).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.endBeforeStart,
      });
    });

    it('accepts an end one minute after the start', async () => {
      await expect(createSlot(newSlot({ startTime: '19:00', endTime: '19:01' }))).resolves.toBeDefined();
    });

    it.each([
      ['starting now', TODAY, '10:00', '11:00'],
      ['already started today', TODAY, '09:00', '11:00'],
      ['on a past day', YESTERDAY, '19:00', '20:30'],
    ])('refuses a slot %s with 400', async (_case, date, startTime, endTime) => {
      await expect(createSlot(newSlot({ date, startTime, endTime }))).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.slotStarted,
      });
    });

    it('accepts a slot starting one minute from now', async () => {
      const times = { date: TODAY, startTime: '10:01', endTime: '11:00' };
      await expect(createSlot(newSlot(times))).resolves.toMatchObject(times);
    });
  });

  describe('tables', () => {
    it.each([
      ['an empty list', []],
      ['no list', undefined],
      ['something that is not a list', 'T1'],
    ])('refuses %s with 400', async (_case, tables) => {
      await expect(createSlot(newSlot({ tables }))).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.noTables,
      });
    });

    it.each([
      ['no table object', null],
      ['no name', { seats: 4 }],
      ['a name that is not text', { name: 5, seats: 4 }],
      ['an empty name', { name: '', seats: 4 }],
      ['a blank name', { name: '   ', seats: 4 }],
      ['no seats', { name: 'T2' }],
      ['0 seats', { name: 'T2', seats: 0 }],
      ['negative seats', { name: 'T2', seats: -1 }],
      ['decimal seats', { name: 'T2', seats: 2.5 }],
      ['seats as text', { name: 'T2', seats: '4' }],
    ])('refuses a table with %s with 400', async (_case, table) => {
      await expect(createSlot(newSlot({ tables: [{ name: 'T1', seats: 4 }, table] }))).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.invalidTable,
      });
    });

    it.each([
      ['the same name', 'T1', 'T1'],
      ['the same name once the spaces are removed', 'T1', ' T1 '],
    ])('refuses two tables with %s with 400', async (_case, first, second) => {
      const tables = [{ name: first, seats: 4 }, { name: second, seats: 6 }];
      await expect(createSlot(newSlot({ tables }))).rejects.toMatchObject({
        status: 400,
        message: MESSAGES.duplicateTableNames,
      });
    });

    it('accepts one table, and any name: letters, numbers or both', async () => {
      const tables = [{ name: 'Terrace', seats: 8 }, { name: '12', seats: 1 }];
      const created = await createSlot(newSlot({ tables }));
      expect(created.tables.map(({ name, seats }) => ({ name, seats }))).toEqual(tables);

      const single = await createSlot(newSlot({ date: '2026-11-04', tables: [{ name: 'T1', seats: 1 }] }));
      expect(single.tables).toHaveLength(1);
    });
  });

  it.each([
    ['nothing', undefined],
    ['something that is not an object', 'dinner'],
  ])('refuses %s with 400', async (_case, slot) => {
    await expect(createSlot(slot)).rejects.toMatchObject({ status: 400, message: 'Slot details are required' });
  });

  it('saves nothing when a rule refuses the slot', async () => {
    await expect(createSlot(newSlot({ tables: [] }))).rejects.toMatchObject({ status: 400 });
    expect(await slotCount()).toBe(0);
  });
});
