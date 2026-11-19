// MH-03 – the booking confirmation email; MH-06 – the same details when a booking is changed.
// The common text (reference, date, time, party size, requirements, name; never table numbers) is in bookingText.js.
import { bookingText, KEEP_REFERENCE_CLOSING } from './bookingText.js';

const SUBJECT = 'Your booking at the mountain hut is confirmed';
const CHANGED_SUBJECT = 'Your booking at the mountain hut has been changed';

/**
 * @param {object} booking as returned by GET /api/bookings/:id
 *   { id, slot: { date, startTime, endTime, label }, partySize, requirements: [{ hasAllergies, description }], ... }
 * @param {object} hiker { firstName, lastName, email }
 * @returns {{ subject: string, text: string }}
 */
export function bookingConfirmedEmail(booking, hiker) {
  return {
    subject: SUBJECT,
    text: bookingText(booking, hiker, { intro: 'your table at the mountain hut is booked.', closing: KEEP_REFERENCE_CLOSING }),
  };
}

/**
 * MH-06: the email sent after a change (PO issue #41), with the booking's new details.
 * @param {object} booking the changed booking, as returned by GET /api/bookings/:id
 * @param {object} hiker { firstName, lastName, email }
 * @returns {{ subject: string, text: string }}
 */
export function bookingChangedEmail(booking, hiker) {
  return {
    subject: CHANGED_SUBJECT,
    text: bookingText(booking, hiker, {
      intro: 'your booking at the mountain hut has been changed. These are the new details.',
      closing: KEEP_REFERENCE_CLOSING,
    }),
  };
}
