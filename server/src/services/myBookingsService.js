// MH-06 BE1: the hiker's own bookings ("My bookings") and the rules for changing a booking.
// MH-06 BE2: the change itself (new tables, saving, email), with checkChange() inside its transaction.
// Messages and status codes follow openapi.yaml (GET /api/bookings, PATCH /api/bookings/{id}).
import { now } from '../clock.js';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { withTransaction } from '../dao/transaction.js';
import { BadRequest, Conflict, NotFound } from '../errors.js';
import { bookingChanged } from '../notifications/notifier.js';
import { allocate } from './availability.js';
import { MESSAGES as BOOKING_MESSAGES, validateRequirements } from './bookingService.js';

export const MESSAGES = {
  bookingNotFound: 'Booking not found',
  nothingToChange: 'Nothing to change',
  cancelled: 'A cancelled booking cannot be changed',
  changeWindow: 'Bookings can be changed up to 48 hours before the slot starts',
  newSlotWindow: 'The new slot must start at least 48 hours from now',
};

// PO issue #43: a booking can be changed while at least 48 hours remain before its slot starts
// (meal on 20 Nov at 13:00 → changes close on 18 Nov at 13:00, that instant included).
const CHANGE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Start of a slot as a Date, in hut local time. @param {{ date: string, startTime: string }} slot */
function slotStart(slot) {
  const [year, month, day] = slot.date.split('-').map(Number);
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/** True while at least 48 hours remain before the slot starts. */
export function changeWindowOpen(slot, at) {
  return slotStart(slot).getTime() - at.getTime() >= CHANGE_WINDOW_MS;
}

/** True when the booking can still be changed: confirmed, and the change window is open. */
export function isChangeable(booking, at) {
  return booking.status === bookingDao.BOOKING_STATUS.CONFIRMED && changeWindowOpen(booking.slot, at);
}

/**
 * GET /api/bookings: every booking of the hiker, confirmed and cancelled, with requirements, status and
 * `changeable`. Upcoming ones first (soonest first), then the ones that have started (most recent first).
 * @param {{ id: number }} hiker the logged-in hiker
 */
export async function listMyBookings(hiker) {
  const at = now();
  const bookings = await bookingDao.findByHiker(await getDb(), hiker.id);
  const withFlag = bookings.map(({ hikerId: _hikerId, ...booking }) => ({
    ...booking,
    changeable: isChangeable(booking, at),
  }));
  const upcoming = withFlag.filter((b) => slotStart(b.slot) > at); // already in date order (findByHiker)
  const past = withFlag.filter((b) => slotStart(b.slot) <= at).reverse(); // most recent first
  return [...upcoming, ...past];
}

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

/**
 * Body of PATCH /api/bookings/{id} (openapi BookingChange) → { slotId?, partySize?, requirements? }, or 400.
 * At least one field; what is not sent stays as it is; `requirements` replaces the whole list.
 */
export function validateChange(body) {
  const { slotId, partySize, requirements } = body !== null && typeof body === 'object' ? body : {};
  if (slotId === undefined && partySize === undefined && requirements === undefined) {
    throw new BadRequest(MESSAGES.nothingToChange);
  }
  const invalid = (value) => value !== undefined && !isPositiveInteger(value);
  if (invalid(slotId) || invalid(partySize)) throw new BadRequest(BOOKING_MESSAGES.invalidBooking);
  const change = {};
  if (slotId !== undefined) change.slotId = slotId;
  if (partySize !== undefined) change.partySize = partySize;
  if (requirements !== undefined) change.requirements = validateRequirements(requirements);
  return change;
}

/**
 * The rules a change must respect before anything is saved (MH-06). Call it inside the transaction of the
 * change (MH-06 BE2), so that what it reads cannot change before the write.
 * - owner only: an unknown booking, or someone else's, is 404 (its existence is not revealed);
 * - a cancelled booking cannot be changed (400);
 * - the change window: at least 48 hours before the booked slot starts (400, PO issue #43);
 * - a new slot must exist (404), the hiker must not already have a booking there (409, one per slot), it must
 *   be open (400) and start at least 48 hours from now (400): PO issue #43 applies the rule to both slots.
 * @param {object} db the connection of the transaction
 * @param {{ id: number }} hiker the logged-in hiker
 * @param {number} bookingId
 * @param {{ slotId?: number }} change as returned by validateChange
 * @returns {Promise<{ booking: object, slot: object }>} the booking as it is now, and the slot it will be in
 */
export async function checkChange(db, hiker, bookingId, change) {
  const booking = await bookingDao.findById(db, bookingId);
  if (!booking || booking.hikerId !== hiker.id) throw new NotFound(MESSAGES.bookingNotFound);
  if (booking.status !== bookingDao.BOOKING_STATUS.CONFIRMED) throw new BadRequest(MESSAGES.cancelled);
  const at = now();
  if (!changeWindowOpen(booking.slot, at)) throw new BadRequest(MESSAGES.changeWindow);

  const slotId = change.slotId ?? booking.slot.id;
  const slot = await slotDao.findById(db, slotId);
  if (!slot) throw new NotFound(BOOKING_MESSAGES.slotNotFound);
  if (slot.id !== booking.slot.id) {
    // Same order as a new booking (MH-01): "already booked" first, then closed, then the time rule.
    if (await bookingDao.hasConfirmedBooking(db, slot.id, hiker.id)) throw new Conflict(BOOKING_MESSAGES.alreadyBooked);
    if (slot.status !== 'open') throw new BadRequest(BOOKING_MESSAGES.slotClosed);
    if (!changeWindowOpen(slot, at)) throw new BadRequest(MESSAGES.newSlotWindow);
  }
  return { booking, slot };
}

// Index bookings_one_per_hiker_slot (schema.sql): a second confirmed booking of the same hiker in a slot.
const isSecondBooking = (err) =>
  err?.code === 'SQLITE_CONSTRAINT' &&
  /UNIQUE constraint failed: bookings\.slot_id, bookings\.hiker_id/.test(err.message);

/**
 * Seats taken at each table of `slotId` by the other bookings: this booking's own seats are left out, so a
 * change is seated as a new booking in that slot (PO issue #38).
 */
async function seatsTakenByOthers(db, slotId, booking) {
  const taken = await bookingDao.allocationsForSlot(db, slotId);
  if (slotId !== booking.slot.id) return taken;
  const own = new Map(booking.tables.map(({ slotTableId, seats }) => [slotTableId, seats]));
  return taken
    .map(({ slotTableId, seats }) => ({ slotTableId, seats: seats - (own.get(slotTableId) ?? 0) }))
    .filter(({ seats }) => seats > 0);
}

/**
 * PATCH /api/bookings/{id} (MH-06): changes the slot, the party size and/or the requirements of a booking.
 * In one transaction: the rules of checkChange(); then, for any change, the tables are assigned again with
 * allocate() as for a new booking, without the booking's own seats (PO issues #38 and #48: the booking may move
 * to other tables; 409 if the party does not fit, and the booking stays as it was); `requirements`, when sent,
 * replaces the whole list.
 * After the commit the hiker gets an email with the new details (if it fails, the change stays valid).
 * @param {{ id: number, firstName: string, lastName: string, email: string }} hiker the logged-in user
 * @param {number} bookingId
 * @param {unknown} body { slotId?, partySize?, requirements? }
 * @returns {Promise<object>} the changed booking (openapi Booking)
 */
export async function changeBooking(hiker, bookingId, body) {
  const change = validateChange(body);
  const db = await getDb();

  let saved;
  try {
    saved = await withTransaction(db, async () => {
      const { booking, slot } = await checkChange(db, hiker, bookingId, change);
      const partySize = change.partySize ?? booking.partySize;
      // Any change is a new booking in that slot (PO #48): the best tables now, possibly different ones.
      const tables = allocate(slot.tables, await seatsTakenByOthers(db, slot.id, booking), partySize);
      if (!tables) throw new Conflict(BOOKING_MESSAGES.notEnoughSeats);
      return bookingDao.update(db, booking.id, {
        slotId: slot.id,
        partySize,
        tables,
        requirements: change.requirements,
      });
    });
  } catch (err) {
    if (isSecondBooking(err)) throw new Conflict(BOOKING_MESSAGES.alreadyBooked);
    throw err;
  }

  const { hikerId: _hikerId, ...booking } = saved; // hikerId is not part of the API answer
  await bookingChanged(booking, hiker); // never throws: the change is already saved
  return booking;
}
