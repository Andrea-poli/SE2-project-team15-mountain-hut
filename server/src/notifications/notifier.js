// Hook called by MH-01 (booking service) after a booking is committed.
// MH-03 BE1: sends the confirmation email to the hiker.
// It must never throw: if the email fails, the booking stays valid (planning 4.3 B).
import { sendMail } from './mailer.js';
import { bookingConfirmedEmail } from './templates/bookingConfirmed.js';

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
