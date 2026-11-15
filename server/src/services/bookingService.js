// Booking a table (MH-01 BE1b): validation, the booking transaction, the email hook.
// MH-05 BE1: optional party requirements, checked here and saved in the same transaction as the booking.
// Messages and status codes follow openapi.yaml (POST /api/bookings); the client mock (api/mocks/bookings.js)
// uses the same ones. Tables are chosen by allocate() of availability.js, the same rule as the availability check.
import { now } from '../clock.js';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { withTransaction } from '../dao/transaction.js';
import { BadRequest, Conflict, NotFound } from '../errors.js';
import { bookingConfirmed } from '../notifications/notifier.js';
import { allocate, bookingClosed } from './availability.js';

export const MESSAGES = {
  invalidBooking: 'slotId and partySize must be positive integers',
  slotNotFound: 'Slot not found',
  slotClosed: 'This slot is closed',
  tooLate: 'Bookings are accepted up to 2 hours before the slot starts',
  notEnoughSeats: 'Not enough seats available for this party',
  alreadyBooked: 'You already have a booking for this slot',
  invalidRequirement: 'Each requirement needs hasAllergies (true or false) and a description',
};

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

/**
 * Party requirements of a request body (MH-05) → [{ hasAllergies, description }] with trimmed descriptions,
 * in the order given; [] when absent. Anything else (not a list, an item that is not an object, hasAllergies
 * not true/false, a description missing or empty after trimming) is an invalid body: 400.
 * No maximum number or length yet: pending PO (planning question 6).
 */
export function validateRequirements(requirements) {
  if (requirements === undefined) return [];
  if (!Array.isArray(requirements)) throw new BadRequest(MESSAGES.invalidRequirement);
  return requirements.map((item) => {
    const { hasAllergies, description } = item !== null && typeof item === 'object' ? item : {};
    const text = typeof description === 'string' ? description.trim() : '';
    if (typeof hasAllergies !== 'boolean' || text === '') throw new BadRequest(MESSAGES.invalidRequirement);
    return { hasAllergies, description: text };
  });
}

/**
 * Body of POST /api/bookings → { slotId, partySize, requirements }, or 400.
 * No upper limit on partySize: the free seats are the limit.
 */
export function validateNewBooking(body) {
  const { slotId, partySize, requirements } = body ?? {};
  if (!isPositiveInteger(slotId) || !isPositiveInteger(partySize)) throw new BadRequest(MESSAGES.invalidBooking);
  return { slotId, partySize, requirements: validateRequirements(requirements) };
}

// Index bookings_one_per_hiker_slot (schema.sql): one confirmed booking per hiker per slot.
// Safety net behind hasConfirmedBooking(): even if a check is missed, the database never accepts a second one.
const isSecondBooking = (err) =>
  err?.code === 'SQLITE_CONSTRAINT' &&
  /UNIQUE constraint failed: bookings\.slot_id, bookings\.hiker_id/.test(err.message);

/**
 * Books a table for `hiker` and returns the booking as GET /api/bookings/:id shows it.
 * Slot, deadline and seats are read again inside the transaction: two bookings at the same time for the
 * last seats are handled one after the other (withTransaction), so the second one gets 409, never an overbooking.
 * After the commit it calls bookingConfirmed() (MH-03): if the email fails, the booking stays valid.
 * @param {{ id: number, firstName: string, lastName: string, email: string }} hiker the logged-in hiker
 * @param {unknown} body { slotId, partySize, requirements? }
 * @throws {BadRequest} invalid body (requirements included), slot closed, less than 2 h before the start
 * @throws {NotFound} unknown slot
 * @throws {Conflict} not enough free seats, or the hiker already has a booking for this slot
 */
export async function createBooking(hiker, body) {
  const { slotId, partySize, requirements } = validateNewBooking(body);
  const db = await getDb();

  let saved;
  try {
    saved = await withTransaction(db, async () => {
      const slot = await slotDao.findById(db, slotId);
      if (!slot) throw new NotFound(MESSAGES.slotNotFound);
      // Before the other checks: a hiker who already booked gets this message even if the slot is now full or closed.
      if (await bookingDao.hasConfirmedBooking(db, slotId, hiker.id)) throw new Conflict(MESSAGES.alreadyBooked);
      if (slot.status !== 'open') throw new BadRequest(MESSAGES.slotClosed);
      if (bookingClosed(slot, now())) throw new BadRequest(MESSAGES.tooLate);

      const tables = allocate(slot.tables, await bookingDao.allocationsForSlot(db, slotId), partySize);
      if (!tables) throw new Conflict(MESSAGES.notEnoughSeats);

      return bookingDao.create(db, {
        slotId,
        hikerId: hiker.id,
        partySize,
        createdAt: now().toISOString(),
        tables,
        requirements,
      });
    });
  } catch (err) {
    if (isSecondBooking(err)) throw new Conflict(MESSAGES.alreadyBooked);
    throw err;
  }

  const { hikerId: _hikerId, ...booking } = saved; // hikerId is not part of the API answer
  try {
    await bookingConfirmed(booking, hiker);
  } catch (err) {
    // The hook must not throw (notifier.js); if it does anyway, the booking is already saved.
    console.error('bookingConfirmed failed, the booking stays valid:', err);
  }
  return booking;
}
