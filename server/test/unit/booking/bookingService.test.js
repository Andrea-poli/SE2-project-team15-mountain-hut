import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import * as userDao from '../../../src/dao/userDao.js';
import { Conflict } from '../../../src/errors.js';
import * as notifier from '../../../src/notifications/notifier.js';
import { createBooking, MESSAGES, validateNewBooking } from '../../../src/services/bookingService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

useFixedClock('2026-11-02T10:00');

let db;
let hikerNumber = 0;

beforeEach(async () => {
  db = await getDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createHiker(name) {
  const email = `${name}-${++hikerNumber}@example.com`;
  return userDao.create(db, {
    email,
    firstName: 'Test',
    lastName: 'Hiker',
    role: 'hiker',
  });
}

async function createBookingFixture({ status = 'open', startTime = '14:00', tableSeats = [4] } = {}) {
  const hiker = await createHiker('hiker');
  const slot = await slotDao.create(db, {
    date: '2026-11-02',
    startTime,
    endTime: '15:00',
    label: 'Lunch',
    status,
    tables: tableSeats.map((seats, index) => ({ name: `Table ${index + 1}`, seats })),
  });
  return { hiker, slot };
}

async function insertBooking({ slot, hiker, status, partySize, seats }) {
  return bookingDao.create(db, {
    slotId: slot.id,
    hikerId: hiker.id,
    partySize,
    status,
    createdAt: '2026-11-02T09:00:00.000Z',
    tables: [{ slotTableId: slot.tables[0].id, seats }],
  });
}

describe('createBooking', () => {
  it('rejects invalid booking details', () => {
    expect(() => validateNewBooking({ slotId: 1, partySize: 2 })).not.toThrow();
    expect(() => validateNewBooking(undefined)).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidBooking }),
    );
    expect(() => validateNewBooking({ slotId: 1, partySize: 0 })).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidBooking }),
    );
    expect(() => validateNewBooking({ slotId: 0, partySize: 2 })).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidBooking }),
    );
  });

  it.each([
    { slotId: 1, partySize: 1.5 },
    { slotId: 1, partySize: '2' },
  ])('rejects a non-integer numeric party size (%o)', (body) => {
    expect(() => validateNewBooking(body)).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidBooking }),
    );
  });

  it('rejects a booking for an unknown slot', async () => {
    const hiker = await createHiker('unknown-slot');

    await expect(createBooking(hiker, { slotId: 999, partySize: 1 }))
      .rejects.toMatchObject({ status: 404, message: MESSAGES.slotNotFound });  
  });

  it('rejects a booking for a closed slot', async () => {
    const { hiker, slot } = await createBookingFixture({ status: 'closed' });

    await expect(createBooking(hiker, { slotId: slot.id, partySize: 1 })).rejects.toMatchObject({
      status: 400,
      message: MESSAGES.slotClosed,
    });
  });

  it('returns already-booked conflict before checking whether the slot is closed', async () => {
    const { hiker, slot } = await createBookingFixture({ status: 'closed' });
    await insertBooking({
      slot,
      hiker,
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
      partySize: 4,
      seats: 4,
    });

    await expect(createBooking(hiker, { slotId: slot.id, partySize: 1 })).rejects.toMatchObject({
      status: 409,
      message: MESSAGES.alreadyBooked,
    });
  });

  it('rejects a booking less than two hours before the slot', async () => {
    const { hiker, slot } = await createBookingFixture({ startTime: '11:59' });

    await expect(createBooking(hiker, { slotId: slot.id, partySize: 1 })).rejects.toMatchObject({
      status: 400,
      message: MESSAGES.tooLate,
    });
  });

  it('ignores a cancelled booking when computing free seats', async () => {
    const { hiker, slot } = await createBookingFixture();
    await insertBooking({
      slot,
      hiker,
      status: bookingDao.BOOKING_STATUS.CANCELLED,
      partySize: 4,
      seats: 4,
    });

    const booking = await createBooking(hiker, { slotId: slot.id, partySize: 4 });

    expect(booking).toMatchObject({ slot: { id: slot.id }, partySize: 4 });
    await expect(bookingDao.findById(db, booking.id)).resolves.toMatchObject({
      id: booking.id,
      partySize: 4,
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
    });
  });

  it('rejects a party exceeding remaining capacity with a 409 conflict and persists no booking', async () => {
    const { hiker, slot } = await createBookingFixture();
    const existingHiker = await createHiker('existing');
    await insertBooking({
      slot,
      hiker: existingHiker,
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
      partySize: 2,
      seats: 2,
    });

    const existingAllocations = await bookingDao.allocationsForSlot(db, slot.id);
    const confirmationSpy = vi.spyOn(notifier, 'bookingConfirmed');
    const createSpy = vi.spyOn(bookingDao, 'create');
    const error = await createBooking(hiker, { slotId: slot.id, partySize: 3 }).catch((err) => err);

    expect(error).toBeInstanceOf(Conflict);
    expect(error.status).toBe(409);
    expect(error.message).toBe(MESSAGES.notEnoughSeats);
    expect(createSpy).not.toHaveBeenCalled();
    expect(confirmationSpy).not.toHaveBeenCalled();
    await expect(bookingDao.allocationsForSlot(db, slot.id)).resolves.toEqual(existingAllocations);
  });

  it('converts the one-booking-per-slot constraint error into a conflict', async () => {
    const { hiker, slot } = await createBookingFixture();
    const duplicateError = Object.assign(
      new Error('UNIQUE constraint failed: bookings.slot_id, bookings.hiker_id'),
      { code: 'SQLITE_CONSTRAINT' },
    );
    vi.spyOn(bookingDao, 'create').mockRejectedValueOnce(duplicateError);

    await expect(createBooking(hiker, { slotId: slot.id, partySize: 1 })).rejects.toMatchObject({
      status: 409,
      message: MESSAGES.alreadyBooked,
    });
  });

  it('returns the complete booking, saves its owner, and sends confirmation after success', async () => {
    const { hiker, slot } = await createBookingFixture({ tableSeats: [6, 4, 4] });
    const confirmationSpy = vi.spyOn(notifier, 'bookingConfirmed');

    const booking = await createBooking(hiker, { slotId: slot.id, partySize: 5 });

    expect(booking).toEqual({
      id: expect.any(Number),
      slot: {
        id: slot.id,
        date: '2026-11-02',
        startTime: '14:00',
        endTime: '15:00',
        label: 'Lunch',
      },
      partySize: 5,
      tables: [{ slotTableId: slot.tables[0].id, tableName: 'Table 1', seats: 5 }],
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
      createdAt: '2026-11-02T09:00:00.000Z',
    });
    expect(booking).not.toHaveProperty('hikerId');
    await expect(bookingDao.findById(db, booking.id)).resolves.toMatchObject({ hikerId: hiker.id });
    expect(confirmationSpy).toHaveBeenCalledOnce();
    expect(confirmationSpy).toHaveBeenCalledWith(booking, hiker);
  });

  it('rethrows unrelated booking persistence errors', async () => {
    const { hiker, slot } = await createBookingFixture();
    const databaseError = Object.assign(
      new Error('UNIQUE constraint failed: unrelated_table.value'),
      { code: 'SQLITE_CONSTRAINT' },
    );
    vi.spyOn(bookingDao, 'create').mockRejectedValueOnce(databaseError);

    await expect(createBooking(hiker, { slotId: slot.id, partySize: 1 })).rejects.toBe(databaseError);
  });

  it('keeps the booking persisted when confirmation email sending fails', async () => {
    const { hiker, slot } = await createBookingFixture();
    const emailError = new Error('Email transport unavailable');
    vi.spyOn(notifier, 'bookingConfirmed').mockRejectedValue(emailError);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const booking = await createBooking(hiker, { slotId: slot.id, partySize: 2 });

    expect(booking).toMatchObject({
      slot: { id: slot.id },
      partySize: 2,
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
    });
    expect(notifier.bookingConfirmed).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith(
      'bookingConfirmed failed, the booking stays valid:',
      emailError,
    );
    await expect(bookingDao.findById(db, booking.id)).resolves.toMatchObject({
      id: booking.id,
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
      partySize: 2,
    });
  });
});
