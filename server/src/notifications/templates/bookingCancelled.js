// MH-08 – text of the email sent when a hiker cancels a booking (PO issue #41: any change is notified).
// Same details as the confirmation (issue #24), so the hiker recognises the booking: reference, date, time slot,
// party size, name. Table numbers are NOT included. Pure function: no I/O, easy to test.
// formatDate is the same as in bookingConfirmed.js; it can be shared once MH-06 (which changes that file) is merged.
import { bookingReference } from '../../bookingReference.js';

const SUBJECT = 'Your booking at the mountain hut has been cancelled';

/** "2026-11-02" → "Monday 2 November 2026" (hut local date, no time zone shift). */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * @param {object} booking the cancelled booking, as returned by GET /api/bookings/:id
 *   { id, slot: { date, startTime, endTime, label }, partySize, ... }
 * @param {object} hiker { firstName, lastName, email }
 * @returns {{ subject: string, text: string }}
 */
export function bookingCancelledEmail(booking, hiker) {
  const name = [hiker.firstName, hiker.lastName].filter(Boolean).join(' ');
  const { slot } = booking;
  const slotName = slot.label ? `${slot.label}, ` : '';
  const people = booking.partySize === 1 ? '1 person' : `${booking.partySize} people`;

  const text = [
    `Hello ${name},`,
    '',
    'your booking at the mountain hut has been cancelled, as you asked.',
    '',
    `Booking reference: ${bookingReference(booking.id)}`,
    `Booked by: ${name}`,
    `Date: ${formatDate(slot.date)}`,
    `Time: ${slotName}${slot.startTime} – ${slot.endTime}`,
    `Party size: ${people}`,
    '',
    'You are welcome to book again whenever you like.',
  ].join('\n');

  return { subject: SUBJECT, text };
}
