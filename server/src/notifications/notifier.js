// Hook called by MH-01 (booking service) after a booking is committed.
// MH-03 BE1: sends the confirmation email to the hiker.
// It must never throw: if the email fails, the booking stays valid (planning 4.3 B).
import { sendMail } from './mailer.js';
import { bookingCancelledEmail } from './templates/bookingCancelled.js';
import { bookingChangedEmail, bookingConfirmedEmail } from './templates/bookingConfirmed.js';

/**
 * @param {object} booking the created booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingConfirmed(booking, hiker) {
  try {
    if (!hiker?.email) {
      // Temporary hikers (MH-07, phone bookings) have no email: nothing to send.
      return false;
    }
    const { subject, text } = bookingConfirmedEmail(booking, hiker);
    await sendMail({ to: hiker.email, subject, text });
    return true;
  } catch (err) {
    // Logged for the staff, never shown to the hiker and never rethrown: the booking is already saved.
    console.error(`Confirmation email for booking ${booking?.id} not sent:`, err);
    return false;
  }
}

/**
 * MH-06: hook called after a change of a booking is committed; sends the new details to the hiker (PO issue #41).
 * Like bookingConfirmed, it never throws: if the email fails, the change stays valid.
 * @param {object} booking the changed booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingChanged(booking, hiker) {
  try {
    if (!hiker?.email) return false; // temporary hikers (MH-07) have no email
    const { subject, text } = bookingChangedEmail(booking, hiker);
    await sendMail({ to: hiker.email, subject, text });
    return true;
  } catch (err) {
    console.error(`Change email for booking ${booking?.id} not sent:`, err);
    return false;
  }
}

/**
 * MH-08: hook called after a cancellation is committed; tells the hiker the booking is cancelled (PO issue #41).
 * Like bookingConfirmed, it never throws: if the email fails, the booking stays cancelled.
 * @param {object} booking the cancelled booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 * @returns {Promise<boolean>} true if the email was sent, false if it could not be sent
 */
export async function bookingCancelled(booking, hiker) {
  try {
    if (!hiker?.email) return false; // temporary hikers (MH-07) have no email
    const { subject, text } = bookingCancelledEmail(booking, hiker);
    await sendMail({ to: hiker.email, subject, text });
    return true;
  } catch (err) {
    console.error(`Cancellation email for booking ${booking?.id} not sent:`, err);
    return false;
  }
}
