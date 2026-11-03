// MH-03 BT1 – text of the confirmation email (templates/bookingConfirmed.js) and the booking reference.
// Content agreed with the PO (course issue #24): reference, date, time slot, party size, requirements,
// name of the hiker who booked; never the table numbers.
import { describe, expect, it } from 'vitest';
import { bookingReference } from '../../../src/bookingReference.js';
import { bookingConfirmedEmail } from '../../../src/notifications/templates/bookingConfirmed.js';

const hiker = { id: 3, firstName: 'Hannah', lastName: 'Hiker', email: 'hannah@example.com' };
const booking = {
  id: 7,
  slot: { id: 2, date: '2026-11-02', startTime: '19:00', endTime: '20:30', label: 'Dinner – 1st turn' },
  partySize: 4,
  tables: [
    { slotTableId: 11, tableName: 'T4', seats: 3 },
    { slotTableId: 12, tableName: 'T5', seats: 1 },
  ],
  status: 'confirmed',
  createdAt: '2026-11-02T09:00:00.000Z',
};

// toLocaleDateString('en-GB') writes "Monday, 2 November 2026" or "Monday 2 November 2026"
// depending on the ICU data of the Node version: both are accepted.
const dateLine = (weekday, rest) => new RegExp(`Date: ${weekday},? ${rest}\n`);

describe('bookingReference', () => {
  it('pads the booking id to six digits', () => {
    expect(bookingReference(7)).toBe('MH-000007');
    expect(bookingReference(123456)).toBe('MH-123456');
  });

  it('keeps longer ids whole', () => {
    expect(bookingReference(1234567)).toBe('MH-1234567');
  });
});

describe('bookingConfirmedEmail', () => {
  it('has a fixed subject', () => {
    expect(bookingConfirmedEmail(booking, hiker).subject).toBe('Your booking at the mountain hut is confirmed');
  });

  it('contains every detail agreed with the PO', () => {
    const { text } = bookingConfirmedEmail(booking, hiker);
    expect(text).toContain('Hello Hannah Hiker,');
    expect(text).toContain('Booking reference: MH-000007');
    expect(text).toContain('Booked by: Hannah Hiker');
    expect(text).toMatch(dateLine('Monday', '2 November 2026'));
    expect(text).toContain('Time: Dinner – 1st turn, 19:00 – 20:30');
    expect(text).toContain('Party size: 4 people');
  });

  it('never shows the table names', () => {
    const { text } = bookingConfirmedEmail(booking, hiker);
    expect(text).not.toMatch(/\bT4\b|\bT5\b/);
    expect(text).not.toMatch(/\btables?:/i);
  });

  it('writes "1 person" for a party of one', () => {
    expect(bookingConfirmedEmail({ ...booking, partySize: 1 }, hiker).text).toContain('Party size: 1 person');
  });

  it('shows the right date also on the days the clocks change and on 31 December', () => {
    const on = (date) => bookingConfirmedEmail({ ...booking, slot: { ...booking.slot, date } }, hiker).text;
    expect(on('2026-03-29')).toMatch(dateLine('Sunday', '29 March 2026'));
    expect(on('2026-10-25')).toMatch(dateLine('Sunday', '25 October 2026'));
    expect(on('2026-12-31')).toMatch(dateLine('Thursday', '31 December 2026'));
  });

  it('works without a slot label and without a last name', () => {
    const { text } = bookingConfirmedEmail(
      { ...booking, slot: { ...booking.slot, label: '' } },
      { ...hiker, lastName: null },
    );
    expect(text).toContain('Hello Hannah,');
    expect(text).toContain('Booked by: Hannah');
    expect(text).toContain('Time: 19:00 – 20:30');
  });

  it('prints no requirements section when there are none', () => {
    expect(bookingConfirmedEmail(booking, hiker).text).not.toContain('Party requirements');
    expect(bookingConfirmedEmail({ ...booking, requirements: [] }, hiker).text).not.toContain('Party requirements');
  });

  it('lists the party requirements, with allergies marked', () => {
    const { text } = bookingConfirmedEmail(
      {
        ...booking,
        requirements: [
          { allergies: false, description: '2 vegetarian' },
          { allergies: true, description: '1 peanut allergy' },
        ],
      },
      hiker,
    );
    expect(text).toContain('Party requirements:\n  - 2 vegetarian\n  - [ALLERGY] 1 peanut allergy');
  });
});
