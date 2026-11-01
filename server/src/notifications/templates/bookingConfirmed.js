// MH-03 – text of the booking confirmation email.
// Content agreed with the PO (SE2-Polito/AY26-27-Mountain-Hut issue #24): a booking reference,
// the date, the time slot, the party size, the party requirements, the name of the hiker who booked.
// Table numbers are NOT included. Pure function: no I/O, easy to test.
import { bookingReference } from '../../bookingReference.js';

const SUBJECT = 'Your booking at the mountain hut is confirmed';

/** "2026-11-02" → "Monday 2 November 2026" (hut local date, no time zone shift). */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Party requirements belong to MH-05 (a later sprint): GET /api/bookings/:id has no `requirements`
// field yet. When MH-05 adds it as a list of { allergies, description }, this section appears by itself;
// until then the list is missing and nothing is printed.
function requirementLines(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) return [];
  return [
    'Party requirements:',
    ...requirements.map((r) => `  - ${r.allergies ? '[ALLERGY] ' : ''}${r.description}`),
    '',
  ];
}

/**
 * @param {object} booking as returned by GET /api/bookings/:id
 *   { id, slot: { date, startTime, endTime, label }, partySize, ... } – `requirements` only after MH-05
 * @param {object} hiker { firstName, lastName, email }
 * @returns {{ subject: string, text: string }}
 */
export function bookingConfirmedEmail(booking, hiker) {
  const name = [hiker.firstName, hiker.lastName].filter(Boolean).join(' ');
  const { slot } = booking;
  const slotName = slot.label ? `${slot.label}, ` : '';
  const people = booking.partySize === 1 ? '1 person' : `${booking.partySize} people`;

  const text = [
    `Hello ${name},`,
    '',
    'your table at the mountain hut is booked.',
    '',
    `Booking reference: ${bookingReference(booking.id)}`,
    `Booked by: ${name}`,
    `Date: ${formatDate(slot.date)}`,
    `Time: ${slotName}${slot.startTime} – ${slot.endTime}`,
    `Party size: ${people}`,
    '',
    ...requirementLines(booking.requirements),
    'Please keep the booking reference: the hut staff may ask for it.',
    '',
    'See you at the hut!',
  ].join('\n');

  return { subject: SUBJECT, text };
}
