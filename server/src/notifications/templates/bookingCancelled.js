// MH-08 – the email sent when a hiker cancels a booking (PO issue #41: any change is notified).
// The same details as the other booking emails (bookingText.js), so the hiker recognises the booking.
import { bookingText } from './bookingText.js';

const SUBJECT = 'Your booking at the mountain hut has been cancelled';
const INTRO = 'your booking at the mountain hut has been cancelled, as you asked.';
const CLOSING = ['You are welcome to book again whenever you like.'];

/**
 * @param {object} booking the cancelled booking, as returned by GET /api/bookings/:id
 * @param {object} hiker { firstName, lastName, email }
 * @returns {{ subject: string, text: string }}
 */
export function bookingCancelledEmail(booking, hiker) {
  return { subject: SUBJECT, text: bookingText(booking, hiker, { intro: INTRO, closing: CLOSING }) };
}
