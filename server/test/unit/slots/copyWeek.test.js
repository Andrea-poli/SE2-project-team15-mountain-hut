// MH-09 BT1 – unit tests of copyWeek() (services/slotService.js), written from the story, the PO answer (#45) and
// docs/openapi.yaml (copyWeek): team rule, tests come from the contract, not from the code.
// - every slot of the source week is created on the same weekday of the target week, with its times, label and
//   tables; bookings are never copied; any date of each week can be given (the Mondays are used);
// - the target week's schedule is replaced (PO #45): refused with 409 if a slot that has not started has a
//   confirmed booking, otherwise its not-started slots are deleted; started slots are never touched;
// - a copy that would not start in the future is skipped ('past'), one overlapping a started slot too ('overlap');
// - everything in one transaction.
// Real temporary SQLite database (setupTestDb.js), data through the DAOs, fixed clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import * as userDao from '../../../src/dao/userDao.js';
import { copyWeek } from '../../../src/services/slotService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now": Wednesday 4 Nov 2026, 10:00 in the hut. Weeks are Monday to Sunday:
const LAST_WEEK = '2026-10-26'; //  Mon 26 Oct – Sun 1 Nov (in the past)
const THIS_WEEK = '2026-11-02'; //  Mon 2 – Sun 8 Nov (Mon and Tue past, Wed is today)
const NEXT_WEEK = '2026-11-09'; //  Mon 9 – Sun 15 Nov
const AFTER_NEXT = '2026-11-16'; // Mon 16 – Sun 22 Nov
useFixedClock('2026-11-04T10:00');

let db;
let hikerNumber = 0;

beforeEach(async () => {
  db = await getDb();
  // Bookings first (their foreign keys), then slots; the tables of the bookings and slots go with them.
  for (const table of ['booking_tables', 'bookings', 'slot_tables', 'slots']) await db.run(`DELETE FROM ${table}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- data helpers (through the DAOs) ----------

async function insertSlot({ date, startTime = '12:00', endTime = '14:00', label = 'Lunch', tables = [{ name: 'T1', seats: 4 }] }) {
  return slotDao.create(db, { date, startTime, endTime, label, tables });
}

/** A booking of 2 seats at the first table of `slot`, for a new hiker; status 'confirmed' or 'cancelled'. */
async function insertBooking(slot, status = 'confirmed') {
  const hiker = await userDao.create(db, {
    email: `mh09-bt1-${++hikerNumber}@example.com`,
    firstName: 'Hannah',
    lastName: 'Hiker',
    role: 'hiker',
  });
  return bookingDao.create(db, {
    slotId: slot.id,
    hikerId: hiker.id,
    partySize: 2,
    status,
    createdAt: '2026-11-01T08:00:00.000Z',
    tables: [{ slotTableId: slot.tables[0].id, seats: 2 }],
  });
}

/** The slots of the week of `monday`, as the DAO reads them (ordered by date and start time). */
const slotsOfWeek = (monday) => {
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return slotDao.findInRange(db, monday, sunday);
};

/** A slot reduced to what a copy keeps: date, times, label and tables (names and seats). */
const shape = ({ date, startTime, endTime, label, tables }) => ({
  date,
  startTime,
  endTime,
  label,
  tables: tables.map(({ name, seats }) => ({ name, seats })),
});

const countRows = async (table) => (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;

// ---------- the copy ----------

describe('copyWeek: the copy', () => {
  it('creates every slot on the same weekday of the target week, with its tables, ordered by date and time', async () => {
    // Inserted out of order on purpose.
    await insertSlot({ date: '2026-11-14', startTime: '08:00', endTime: '09:00', label: 'Breakfast', tables: [{ name: 'Bar', seats: 2 }] });
    await insertSlot({ date: '2026-11-09', startTime: '19:00', endTime: '20:30', label: 'Dinner', tables: [{ name: 'T1', seats: 8 }] });
    await insertSlot({
      date: '2026-11-09',
      label: 'Lunch',
      tables: [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 6 }],
    });

    const result = await copyWeek(NEXT_WEEK, AFTER_NEXT);

    expect(result.created.map(shape)).toEqual([
      { date: '2026-11-16', startTime: '12:00', endTime: '14:00', label: 'Lunch', tables: [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 6 }] },
      { date: '2026-11-16', startTime: '19:00', endTime: '20:30', label: 'Dinner', tables: [{ name: 'T1', seats: 8 }] },
      { date: '2026-11-21', startTime: '08:00', endTime: '09:00', label: 'Breakfast', tables: [{ name: 'Bar', seats: 2 }] },
    ]);
    expect(result.replaced).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect((await slotsOfWeek(AFTER_NEXT)).map(shape)).toEqual(result.created.map(shape)); // really saved
    expect(await slotsOfWeek(NEXT_WEEK)).toHaveLength(3); // the source week is untouched
  });

  it('accepts any date of each week (here a Sunday and a Wednesday): it uses their Mondays', async () => {
    await insertSlot({ date: '2026-11-09' });

    const result = await copyWeek('2026-11-15', '2026-11-18');

    expect(result.created.map((slot) => slot.date)).toEqual(['2026-11-16']);
  });

  it('copies from a week in the past too', async () => {
    await insertSlot({ date: '2026-10-27', label: 'Tuesday lunch' });

    const result = await copyWeek(LAST_WEEK, NEXT_WEEK);

    expect(result.created.map(({ date, label }) => ({ date, label }))).toEqual([{ date: '2026-11-10', label: 'Tuesday lunch' }]);
  });

  it('never copies the bookings: the copied slot is empty, the source keeps its booking', async () => {
    const source = await insertSlot({ date: '2026-11-09' });
    await insertBooking(source);

    const [copy] = (await copyWeek(NEXT_WEEK, AFTER_NEXT)).created;

    expect(await bookingDao.allocationsForSlot(db, copy.id)).toEqual([]);
    expect(await bookingDao.allocationsForSlot(db, source.id)).toEqual([{ slotTableId: source.tables[0].id, seats: 2 }]);
  });

  it.each([
    ['the same date', '2026-11-09', '2026-11-09'],
    ['its Monday and its Sunday', '2026-11-09', '2026-11-15'],
  ])('refuses to copy a week onto itself (%s) with 400', async (_case, sourceWeek, targetWeek) => {
    await insertSlot({ date: '2026-11-09' });

    await expect(copyWeek(sourceWeek, targetWeek)).rejects.toMatchObject({
      status: 400,
      message: 'Choose a different week to copy into',
    });
    expect(await slotsOfWeek(NEXT_WEEK)).toHaveLength(1);
  });
});

// ---------- the existing schedule of the target week (PO #45) ----------

describe('copyWeek: the existing schedule of the target week (PO #45)', () => {
  it('replaces the slots that have no bookings, and lists them in replaced', async () => {
    await insertSlot({ date: '2026-11-09', label: 'Lunch' });
    const old1 = await insertSlot({ date: '2026-11-17', startTime: '11:00', endTime: '13:00', label: 'Old brunch' });
    const old2 = await insertSlot({ date: '2026-11-18', startTime: '19:00', endTime: '21:00', label: 'Old dinner' });

    const result = await copyWeek(NEXT_WEEK, AFTER_NEXT);

    expect(result.replaced.map((slot) => slot.id)).toEqual([old1.id, old2.id]);
    expect(result.replaced.map(shape)).toEqual([shape(old1), shape(old2)]);
    expect((await slotsOfWeek(AFTER_NEXT)).map(({ date, label }) => ({ date, label }))).toEqual([
      { date: '2026-11-16', label: 'Lunch' },
    ]);
  });

  it('refuses with 409 when a slot that has not started has a confirmed booking, and changes nothing', async () => {
    await insertSlot({ date: '2026-11-09', label: 'Lunch' });
    const booked = await insertSlot({ date: '2026-11-17', label: 'Booked lunch' });
    await insertBooking(booked);
    await insertSlot({ date: '2026-11-18', label: 'Free lunch' });
    const before = await slotsOfWeek(AFTER_NEXT);

    await expect(copyWeek(NEXT_WEEK, AFTER_NEXT)).rejects.toMatchObject({
      status: 409,
      message: 'The target week has bookings: its schedule cannot be replaced',
    });

    expect(await slotsOfWeek(AFTER_NEXT)).toEqual(before); // nothing deleted, nothing created
    expect(await bookingDao.allocationsForSlot(db, booked.id)).toHaveLength(1);
  });

  it('a cancelled booking does not block the copy: its slot is replaced, and the cancelled booking goes with it', async () => {
    await insertSlot({ date: '2026-11-09', label: 'Lunch' });
    const cancelledOnly = await insertSlot({ date: '2026-11-17', label: 'Cancelled lunch' });
    const cancelled = await insertBooking(cancelledOnly, 'cancelled');

    const result = await copyWeek(NEXT_WEEK, AFTER_NEXT);

    expect(result.replaced.map((slot) => slot.id)).toEqual([cancelledOnly.id]);
    // By content, not by id: SQLite may give the new copy the id of the deleted slot.
    expect((await slotsOfWeek(AFTER_NEXT)).map(({ date, label }) => ({ date, label }))).toEqual([
      { date: '2026-11-16', label: 'Lunch' },
    ]);
    expect(await bookingDao.findById(db, cancelled.id)).toBeNull();
  });

  it('an empty source week replaces the target schedule with nothing', async () => {
    const old = await insertSlot({ date: '2026-11-17' });

    const result = await copyWeek(NEXT_WEEK, AFTER_NEXT);

    expect(result).toEqual({ created: [], replaced: [expect.objectContaining({ id: old.id })], skipped: [] });
    expect(await slotsOfWeek(AFTER_NEXT)).toEqual([]);
  });

  it('never touches the slots that have already started, even with confirmed bookings; it replaces the others', async () => {
    // Target = this week, now Wed 4 Nov 10:00.
    const monday = await insertSlot({ date: '2026-11-02', label: 'Past lunch' });
    await insertBooking(monday); // a started slot with a booking does not block
    const breakfast = await insertSlot({ date: '2026-11-04', startTime: '08:00', endTime: '09:00', label: 'Breakfast today' });
    const thursday = await insertSlot({ date: '2026-11-05', label: 'Thursday lunch' });
    await insertSlot({ date: '2026-11-12', startTime: '19:00', endTime: '20:30', label: 'Dinner' });

    const result = await copyWeek(NEXT_WEEK, THIS_WEEK);

    expect(result.replaced.map((slot) => slot.id)).toEqual([thursday.id]);
    expect((await slotsOfWeek(THIS_WEEK)).map(({ id, label }) => ({ id, label }))).toEqual([
      { id: monday.id, label: 'Past lunch' },
      { id: breakfast.id, label: 'Breakfast today' },
      { id: result.created[0].id, label: 'Dinner' },
    ]);
    expect(await bookingDao.allocationsForSlot(db, monday.id)).toHaveLength(1);
  });
});

// ---------- slots skipped in the target week ----------

describe('copyWeek: slots skipped in the target week', () => {
  it("skips, with reason 'past', every copy that would not start in the future (past days, today before now)", async () => {
    await insertSlot({ date: '2026-11-09', label: 'Monday lunch' }); //                                    → Mon 2: past
    await insertSlot({ date: '2026-11-11', startTime: '09:30', endTime: '10:30', label: 'Early' }); //    → today, started
    await insertSlot({ date: '2026-11-11', startTime: '10:30', endTime: '11:00', label: 'Coffee' }); //   → today, later
    await insertSlot({ date: '2026-11-13', startTime: '19:00', endTime: '20:30', label: 'Friday dinner' }); // → Fri 6

    const result = await copyWeek(NEXT_WEEK, THIS_WEEK);

    expect(result.skipped).toEqual([
      { date: '2026-11-02', startTime: '12:00', endTime: '14:00', label: 'Monday lunch', reason: 'past' },
      { date: '2026-11-04', startTime: '09:30', endTime: '10:30', label: 'Early', reason: 'past' },
    ]);
    expect(result.created.map(({ date, label }) => ({ date, label }))).toEqual([
      { date: '2026-11-04', label: 'Coffee' },
      { date: '2026-11-06', label: 'Friday dinner' },
    ]);
  });

  it("a copy starting exactly now does not start in the future: skipped as 'past'", async () => {
    await insertSlot({ date: '2026-11-11', startTime: '10:00', endTime: '11:00', label: 'Now' });

    const result = await copyWeek(NEXT_WEEK, THIS_WEEK);

    expect(result.skipped).toEqual([{ date: '2026-11-04', startTime: '10:00', endTime: '11:00', label: 'Now', reason: 'past' }]);
    expect(result.created).toEqual([]);
  });

  it("skips, with reason 'overlap', a copy that would overlap a slot already under way; an adjacent one is copied", async () => {
    const underWay = await insertSlot({ date: '2026-11-04', startTime: '09:00', endTime: '11:00', label: 'Brunch' }); // started
    await insertSlot({ date: '2026-11-11', startTime: '10:30', endTime: '10:50', label: 'Overlapping' });
    await insertSlot({ date: '2026-11-11', startTime: '11:00', endTime: '12:00', label: 'Adjacent' });

    const result = await copyWeek(NEXT_WEEK, THIS_WEEK);

    expect(result.skipped).toEqual([
      { date: '2026-11-04', startTime: '10:30', endTime: '10:50', label: 'Overlapping', reason: 'overlap' },
    ]);
    expect(result.created.map(({ label, startTime }) => ({ label, startTime }))).toEqual([
      { label: 'Adjacent', startTime: '11:00' },
    ]);
    expect(await slotDao.findById(db, underWay.id)).not.toBeNull(); // the slot under way stays
  });
});

// ---------- one transaction ----------

describe('copyWeek: one transaction', () => {
  it('if a copy cannot be saved, nothing changes: the target schedule stays and no copy is left', async () => {
    await insertSlot({ date: '2026-11-09', label: 'First' });
    await insertSlot({ date: '2026-11-10', label: 'Second' });
    const old = await insertSlot({ date: '2026-11-17', label: 'Old' });
    const realCreate = slotDao.create;
    vi.spyOn(slotDao, 'create')
      .mockImplementationOnce((...args) => realCreate(...args))
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(copyWeek(NEXT_WEEK, AFTER_NEXT)).rejects.toThrow('disk full');

    expect((await slotsOfWeek(AFTER_NEXT)).map((slot) => slot.id)).toEqual([old.id]);
    expect(await countRows('slots')).toBe(3);
  });
});
