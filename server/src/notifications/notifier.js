// Hooks called by the booking services after a change is committed: one email to the hiker for each booking
// event (PO issue #41). MH-03 BE1: confirmation (MH-01); MH-06 BE2: change; MH-08 BE1: cancellation.
// They must never throw: if the email fails, the booking (or its change, or its cancellation) stays valid
// (planning 4.3 B).
import { sendMail } from './mailer.js';
import { bookingCancelledEmail } from './templates/bookingCancelled.js';
import { bookingChangedEmail, bookingConfirmedEmail } from './templates/bookingConfirmed.js';

/**
 * Sends the email built by `makeEmail` to the hiker. Never throws: errors are logged for the staff (never shown
 * to the hiker) and give false. Temporary hikers (MH-07, phone bookings) have no email: nothing is sent.
 * @param {(booking: object, hiker: object) => { subject: string, text: string }} makeEmail
 * @param {string} kind name of the email in the log, e.g. 'Confirmation'
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
async function sendBookingEmail(makeEmail, kind, booking, hiker) {
  try {
    if (!hiker?.email) return false;
    const { subject, text } = makeEmail(booking, hiker);
    await sendMail({ to: hiker.email, subject, text });
    return true;
  } catch (err) {
    console.error(`${kind} email for booking ${booking?.id} not sent:`, err);
    return false;
  }
}

/**
 * MH-03: after a booking is created.
 * @param {object} booking the created booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingConfirmed(booking, hiker) {
  return sendBookingEmail(bookingConfirmedEmail, 'Confirmation', booking, hiker);
}

/**
 * MH-06: after a change of a booking, with the new details.
 * @param {object} booking the changed booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingChanged(booking, hiker) {
  return sendBookingEmail(bookingChangedEmail, 'Change', booking, hiker);
}

/**
 * MH-08: after a booking is cancelled.
 * @param {object} booking the cancelled booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingCancelled(booking, hiker) {
  return sendBookingEmail(bookingCancelledEmail, 'Cancellation', booking, hiker);
}
