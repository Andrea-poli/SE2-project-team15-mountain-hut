// MH-06 BT1 – unit tests of the change rules (services/myBookingsService.js), written from the story, the PO
// answers and docs/openapi.yaml 0.2.1 (team rule: tests come from the contract, not from the code):
// - 48 hours (PO #43): a booking can be changed while at least 48 hours remain before its slot starts; for a
//   meal on 20 Nov at 13:00 changes close on 18 Nov at 13:00, that instant still included. A new slot must also
//   start at least 48 hours from now ("both the original and the new slot").
// - any change is a new booking in that slot (PO #38, #48): the booking's own seats are released and the tables
//   are assigned again with the allocation rule, possibly different ones; 409 if the party does not fit, and the
//   booking stays as it was.
// - one booking per hiker per slot (MH-01), and the 2-hour rule of MH-01, which the 48-hour rule now covers.
// Real temporary SQLite database (setupTestDb.js), fixed clock, the email hook spied.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import * as userDao from '../../../src/dao/userDao.js';
import * as notifier from '../../../src/notifications/notifier.js';
import { MESSAGES as BOOKING_MESSAGES } from '../../../src/services/bookingService.js';
import {
  changeBooking,
  changeWindowOpen,
  isChangeable,
  MESSAGES,
} from '../../../src/services/myBookingsService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut. Exactly 48 hours later: Wednesday 4 Nov, 10:00.
const NOW = new Date(2026, 10, 2, 10, 0);
useFixedClock('2026-11-02T10:00');

const FAR = '2026-11-10'; // well outside the 48 hours
let db;
let hikerNumber = 0;

beforeEach(async () => {
  db = await getDb();
  vi.spyOn(notifier, 'bookingChanged').mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- data helpers (through the DAOs) ----------

async function createHiker() {
  return userDao.create(db, {
    email: `mh06-bt1-${++hikerNumber}@example.com`,
    firstName: 'Hannah',
    lastName: 'Hiker',
    role: 'hiker',
  });
}

/** A slot with tables named T1, T2, … of the given sizes. */
async function createSlot({ date = FAR, startTime = '19:00', endTime = '20:30', status = 'open', seats = [4, 4, 6] } = {}) {
  return slotDao.create(db, {
    date,
    startTime,
    endTime,
    label: 'Dinner',
    status,
    tables: seats.map((n, i) => ({ name: `T${i + 1}`, seats: n })),
  });
}

/** Saves a booking that takes `taken` seats at the named tables, e.g. { T1: 3 }; partySize is their sum. */
async function createBooking(slot, hiker, taken, { status = 'confirmed', requirements = [] } = {}) {
  const tables = Object.entries(taken).map(([name, seats]) => ({
    slotTableId: slot.tables.find((t) => t.name === name).id,
    seats,
  }));
  return bookingDao.create(db, {
    slotId: slot.id,
    hikerId: hiker.id,
    partySize: tables.reduce((sum, t) => sum + t.seats, 0),
    status,
    createdAt: '2026-10-30T09:00:00.000Z',
    tables,
    requirements,
  });
}

/** The tables of a booking as [tableName, seats] pairs, sorted by name. */
const seating = (booking) => booking.tables.map((t) => [t.tableName, t.seats]).sort();

/** Expects `promise` to reject with an HTTP error of `status` and `message` (errors.js). */
const rejectsWith = (promise, status, message) =>
  expect(promise).rejects.toMatchObject({ status, message });

/** The booking as saved now, without the fields a refused change must not touch. */
async function saved(id) {
  const { slot, partySize, tables, requirements, status } = await bookingDao.findById(db, id);
  return { slotId: slot.id, partySize, tables, requirements, status };
}

// ---------- 48-hour rule ----------

describe('48-hour rule: the window to change a booking (PO #43)', () => {
  const slotAt = (date, startTime) => ({ date, startTime });

  it.each([
    ['48 hours and 1 minute before the slot', slotAt('2026-11-04', '10:01'), true],
    ['days before the slot', slotAt(FAR, '19:00'), true],
    ['exactly 48 hours before the slot (that instant still included)', slotAt('2026-11-04', '10:00'), true],
    ['47 hours and 59 minutes before the slot', slotAt('2026-11-04', '09:59'), false],
    ['the day before the slot', slotAt('2026-11-03', '19:00'), false],
    ['less than 2 hours before the slot', slotAt('2026-11-02', '11:30'), false],
    ['after the slot has started', slotAt('2026-11-02', '09:00'), false],
  ])('%s → window open: %s', (_case, slot, open) => {
    expect(changeWindowOpen(slot, NOW)).toBe(open);
  });

  it('only a confirmed booking inside the window is changeable', () => {
    const inside = slotAt(FAR, '19:00');
    const outside = slotAt('2026-11-03', '19:00');
    expect(isChangeable({ status: 'confirmed', slot: inside }, NOW)).toBe(true);
    expect(isChangeable({ status: 'confirmed', slot: outside }, NOW)).toBe(false);
    expect(isChangeable({ status: 'cancelled', slot: inside }, NOW)).toBe(false);
  });

  it.each([
    ['exactly 48 hours before the slot', '10:00'],
    ['48 hours and 1 minute before the slot', '10:01'],
  ])('changes a booking %s, saves it and sends the email', async (_case, startTime) => {
    const hiker = await createHiker();
    const slot = await createSlot({ date: '2026-11-04', startTime });
    const booking = await createBooking(slot, hiker, { T1: 2 });

    const changed = await changeBooking(hiker, booking.id, { partySize: 3 });

    expect(changed.partySize).toBe(3);
    expect(await saved(booking.id)).toMatchObject({ partySize: 3, status: 'confirmed' });
    expect(notifier.bookingChanged).toHaveBeenCalledOnce();
  });

  it.each([
    ['47 hours and 59 minutes before', '2026-11-04', '09:59'],
    ['the day before', '2026-11-03', '19:00'],
  ])('refuses any change %s the booked slot, also of the requirements only, and keeps the booking', async (_case, date, startTime) => {
    const hiker = await createHiker();
    const slot = await createSlot({ date, startTime });
    const booking = await createBooking(slot, hiker, { T1: 2 });
    const before = await saved(booking.id);
    const later = await createSlot({ date: FAR });

    for (const change of [
      { partySize: 3 },
      { requirements: [{ hasAllergies: true, description: '1 peanut allergy' }] },
      { slotId: later.id },
    ]) {
      await rejectsWith(changeBooking(hiker, booking.id, change), 400, MESSAGES.changeWindow);
    }
    expect(await saved(booking.id)).toEqual(before);
    expect(notifier.bookingChanged).not.toHaveBeenCalled();
  });

  it.each([
    ['48 hours and 1 minute from now is accepted', '2026-11-04', '10:01', true],
    ['exactly 48 hours from now is accepted', '2026-11-04', '10:00', true],
    ['47 hours and 59 minutes from now is refused', '2026-11-04', '09:59', false],
    ['the day after is refused', '2026-11-03', '19:00', false],
  ])('moving to a new slot starting %s (the rule applies to both slots)', async (_case, date, startTime, accepted) => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot({ date: FAR }), hiker, { T1: 2 });
    const target = await createSlot({ date, startTime });

    if (accepted) {
      expect((await changeBooking(hiker, booking.id, { slotId: target.id })).slot.id).toBe(target.id);
    } else {
      const before = await saved(booking.id);
      await rejectsWith(changeBooking(hiker, booking.id, { slotId: target.id }), 400, MESSAGES.newSlotWindow);
      expect(await saved(booking.id)).toEqual(before);
    }
  });
});

// ---------- allocation without the booking's own seats ----------

describe('allocation: a change is a new booking, without its own seats (PO #38, #48)', () => {
  it("counts the booking's own seats as free: a bigger party fits where only its seats are", async () => {
    const hiker = await createHiker();
    const slot = await createSlot({ seats: [4, 4] });
    const booking = await createBooking(slot, hiker, { T1: 3 });
    await createBooking(slot, await createHiker(), { T2: 4 }); // T2 full: only T1 is left, 1 seat beyond ours

    const changed = await changeBooking(hiker, booking.id, { partySize: 4 });

    expect(seating(changed)).toEqual([['T1', 4]]);
  });

  it('moves a smaller party to the best table, even if it still fits where it is (PO #48)', async () => {
    const hiker = await createHiker();
    const slot = await createSlot({ seats: [4, 2] });
    const booking = await createBooking(slot, hiker, { T1: 3 });

    const changed = await changeBooking(hiker, booking.id, { partySize: 2 });

    expect(seating(changed)).toEqual([['T2', 2]]); // the 2-seat table fits exactly, as for a new booking of 2
  });

  it('assigns the tables again also when only the requirements change (PO #48), and replaces them', async () => {
    const hiker = await createHiker();
    const slot = await createSlot({ seats: [4, 2] });
    const booking = await createBooking(slot, hiker, { T1: 2 }, {
      requirements: [{ hasAllergies: false, description: '2 vegetarians' }],
    });
    const requirements = [{ hasAllergies: true, description: '1 shellfish allergy' }];

    const changed = await changeBooking(hiker, booking.id, { requirements });

    expect(seating(changed)).toEqual([['T2', 2]]);
    expect(changed.partySize).toBe(2);
    expect(changed.requirements).toEqual(requirements);
  });

  it('splits a bigger party over several tables when no single table has room', async () => {
    const hiker = await createHiker();
    const slot = await createSlot({ seats: [4, 4, 6] });
    const booking = await createBooking(slot, hiker, { T3: 6 });

    const changed = await changeBooking(hiker, booking.id, { partySize: 8 });

    expect(seating(changed)).toEqual([['T1', 4], ['T2', 4]]); // the allocation rule's example: 6, 4, 4 → the two 4s
  });

  it('refuses a party that does not fit with 409, and the booking stays exactly as it was', async () => {
    const hiker = await createHiker();
    const slot = await createSlot({ seats: [4, 4] });
    const booking = await createBooking(slot, hiker, { T1: 3 }, {
      requirements: [{ hasAllergies: false, description: '1 vegetarian' }],
    });
    await createBooking(slot, await createHiker(), { T2: 4 });
    const before = await saved(booking.id);

    await rejectsWith(
      changeBooking(hiker, booking.id, { partySize: 5, requirements: [] }),
      409,
      BOOKING_MESSAGES.notEnoughSeats,
    );

    expect(await saved(booking.id)).toEqual(before);
    expect(notifier.bookingChanged).not.toHaveBeenCalled();
  });

  it('in a new slot the party is seated as a new booking there, and its old seats are free again', async () => {
    const hiker = await createHiker();
    const from = await createSlot({ seats: [4] });
    const to = await createSlot({ date: '2026-11-11', seats: [6, 2] });
    const booking = await createBooking(from, hiker, { T1: 2 });

    const changed = await changeBooking(hiker, booking.id, { slotId: to.id });

    expect(changed.slot.id).toBe(to.id);
    expect(seating(changed)).toEqual([['T2', 2]]);
    expect(await bookingDao.allocationsForSlot(db, from.id)).toEqual([]);
  });

  it('refuses a new slot where the party does not fit, keeping the booking in its slot', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot({ seats: [6] }), hiker, { T1: 5 });
    const small = await createSlot({ date: '2026-11-11', seats: [4] });
    const before = await saved(booking.id);

    await rejectsWith(changeBooking(hiker, booking.id, { slotId: small.id }), 409, BOOKING_MESSAGES.notEnoughSeats);

    expect(await saved(booking.id)).toEqual(before);
  });
});

// ---------- one booking per slot, and the 2-hour rule ----------

describe('one booking per hiker per slot, and the 2-hour rule', () => {
  it('refuses moving into a slot where the hiker already has a confirmed booking (409)', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });
    const other = await createSlot({ date: '2026-11-11' });
    await createBooking(other, hiker, { T1: 2 });
    const before = await saved(booking.id);

    await rejectsWith(changeBooking(hiker, booking.id, { slotId: other.id }), 409, BOOKING_MESSAGES.alreadyBooked);

    expect(await saved(booking.id)).toEqual(before);
  });

  it('allows moving into a slot where the hiker only has a cancelled booking', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });
    const other = await createSlot({ date: '2026-11-11' });
    await createBooking(other, hiker, { T1: 2 }, { status: 'cancelled' });

    expect((await changeBooking(hiker, booking.id, { slotId: other.id })).slot.id).toBe(other.id);
  });

  it('a change in the same slot is not a second booking there', async () => {
    const hiker = await createHiker();
    const slot = await createSlot();
    const booking = await createBooking(slot, hiker, { T1: 2 });

    const changed = await changeBooking(hiker, booking.id, { slotId: slot.id, partySize: 3 });

    expect(changed.slot.id).toBe(slot.id);
    expect(changed.partySize).toBe(3);
  });

  it('turns the database guard against a second booking into the same 409', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });
    const other = await createSlot({ date: '2026-11-11' });
    const duplicate = Object.assign(new Error('UNIQUE constraint failed: bookings.slot_id, bookings.hiker_id'), {
      code: 'SQLITE_CONSTRAINT',
    });
    vi.spyOn(bookingDao, 'update').mockRejectedValueOnce(duplicate);

    await rejectsWith(changeBooking(hiker, booking.id, { slotId: other.id }), 409, BOOKING_MESSAGES.alreadyBooked);
  });

  it('refuses moving into a slot that starts within 2 hours (covered by the 48-hour rule)', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });
    const soon = await createSlot({ date: '2026-11-02', startTime: '11:30', endTime: '12:30' });

    await rejectsWith(changeBooking(hiker, booking.id, { slotId: soon.id }), 400, MESSAGES.newSlotWindow);
  });

  it('refuses changing a booking whose slot starts within 2 hours', async () => {
    const hiker = await createHiker();
    const soon = await createSlot({ date: '2026-11-02', startTime: '11:30', endTime: '12:30' });
    const booking = await createBooking(soon, hiker, { T1: 2 });

    await rejectsWith(changeBooking(hiker, booking.id, { partySize: 1 }), 400, MESSAGES.changeWindow);
  });
});

// ---------- email hook and request body ----------

describe('change: email hook and request body', () => {
  it('keeps the change when the email hook fails anyway (it must not throw)', async () => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });
    const emailError = new Error('Email transport unavailable');
    vi.mocked(notifier.bookingChanged).mockRejectedValue(emailError);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const changed = await changeBooking(hiker, booking.id, { partySize: 3 });

    expect(changed.partySize).toBe(3);
    expect(await saved(booking.id)).toMatchObject({ partySize: 3, status: 'confirmed' });
    expect(logError).toHaveBeenCalledWith('bookingChanged failed, the change stays valid:', emailError);
  });

  it.each([null, 'party of 3', [3]])('refuses a body that is not an object (%o) with 400', async (body) => {
    const hiker = await createHiker();
    const booking = await createBooking(await createSlot(), hiker, { T1: 2 });

    await rejectsWith(changeBooking(hiker, booking.id, body), 400, MESSAGES.nothingToChange);
  });
});
