// MH-08 BE1: a hiker cancels their own booking (POST /api/bookings/{id}/cancel, openapi.yaml cancelBooking).
// Allowed at any time, also after the slot started (PO issue #8, MH-08 clarification). The booking is kept with
// status 'cancelled' and its seats are free again; after the commit the hiker gets an email (PO issue #41).
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import { withTransaction } from '../dao/transaction.js';
import { Conflict, NotFound } from '../errors.js';
import { bookingCancelled } from '../notifications/notifier.js';

export const MESSAGES = {
  bookingNotFound: 'Booking not found',
  alreadyCancelled: 'This booking is already cancelled',
};

/**
 * Cancels the booking `bookingId` of `hiker` and returns it as GET /api/bookings/:id shows it
 * (status 'cancelled', tables []). Read and update are in one transaction, so two cancels at the same time
 * (a double click) give one 200 and one 409.
 * @param {{ id: number, firstName: string, lastName: string, email: string }} hiker the logged-in user
 * @param {number} bookingId
 * @throws {NotFound} unknown booking, or someone else's (staff included): its existence is not revealed
 * @throws {Conflict} the booking is already cancelled
 */
export async function cancelBooking(hiker, bookingId) {
  const db = await getDb();
  const saved = await withTransaction(db, async () => {
    const booking = await bookingDao.findById(db, bookingId);
    if (!booking || booking.hikerId !== hiker.id) throw new NotFound(MESSAGES.bookingNotFound);
    if (!(await bookingDao.cancel(db, booking.id))) throw new Conflict(MESSAGES.alreadyCancelled);
    return bookingDao.findById(db, booking.id);
  });

  const { hikerId: _hikerId, ...booking } = saved; // hikerId is not part of the API answer
  try {
    await bookingCancelled(booking, hiker);
  } catch (err) {
    // The hook must not throw (notifier.js); if it does anyway, the booking is already cancelled.
    console.error('bookingCancelled failed, the booking stays cancelled:', err);
  }
  return booking;
}
