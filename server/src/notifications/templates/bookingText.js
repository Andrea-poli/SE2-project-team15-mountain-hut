// The common text of every booking email (MH-03 confirmation, MH-06 change, MH-08 cancellation).
// Content agreed with the PO (SE2-Polito/AY26-27-Mountain-Hut issues #24, #41): a booking reference, the date, the
// time slot, the party size, the party requirements, the name of the hiker who booked.
// Table numbers are NOT included. Pure functions: no I/O, easy to test.
import { bookingReference } from '../../bookingReference.js';

/** The closing lines of the confirmation and of the change email. */
export const KEEP_REFERENCE_CLOSING = ['Please keep the booking reference: the hut staff may ask for it.', '', 'See you at the hut!'];

/** "2026-11-02" → "Monday 2 November 2026" (hut local date, no time zone shift). */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Party requirements (MH-05): one line each, in the order the hiker entered them; the ones with the
// allergies flag are marked so the kitchen notices them. No section when the booking has none.
function requirementLines(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) return [];
  return [
    'Party requirements:',
    ...requirements.map((r) => `  - ${r.hasAllergies ? '[ALLERGY] ' : ''}${r.description}`),
    '',
  ];
}

/**
 * The text of a booking email: a greeting, `intro`, the details of the booking, then `closing`.
 * @param {object} booking as returned by GET /api/bookings/:id
 *   { id, slot: { date, startTime, endTime, label }, partySize, requirements: [{ hasAllergies, description }], ... }
 * @param {object} hiker { firstName, lastName, email }
 * @param {{ intro: string, closing: string[] }} parts what this email says before and after the details
 * @returns {string}
 */
export function bookingText(booking, hiker, { intro, closing }) {
  const name = [hiker.firstName, hiker.lastName].filter(Boolean).join(' ');
  const { slot } = booking;
  const slotName = slot.label ? `${slot.label}, ` : '';
  const people = booking.partySize === 1 ? '1 person' : `${booking.partySize} people`;

  return [
    `Hello ${name},`,
    '',
    intro,
    '',
    `Booking reference: ${bookingReference(booking.id)}`,
    `Booked by: ${name}`,
    `Date: ${formatDate(slot.date)}`,
    `Time: ${slotName}${slot.startTime} – ${slot.endTime}`,
    `Party size: ${people}`,
    '',
    ...requirementLines(booking.requirements),
    ...closing,
  ].join('\n');
}
