// MH-20 BT1 – unit tests of parseLocalDateTime (clock.js), the hut-local 'YYYY-MM-DDTHH:MM' reader shared by
// FAKE_NOW and the departure / expected return of a hike (MH-20 BE1). The FAKE_NOW side is in clock.test.js.
import { describe, expect, it } from 'vitest';
import { parseLocalDateTime } from '../../src/clock.js';

describe('parseLocalDateTime', () => {
  it('reads a hut-local date and time (Europe/Rome, UTC+1 in winter, UTC+2 in summer)', () => {
    expect(parseLocalDateTime('2026-11-28T08:30').date.toISOString()).toBe('2026-11-28T07:30:00.000Z');
    expect(parseLocalDateTime('2026-07-15T12:30').date.toISOString()).toBe('2026-07-15T10:30:00.000Z');
    expect(parseLocalDateTime('2028-02-29T00:00').error).toBeUndefined(); // leap day
  });

  it.each([
    ['a date without the time', '2026-11-28'],
    ['a space instead of T', '2026-11-28 08:30'],
    ['seconds', '2026-11-28T08:30:00'],
    ['a time zone', '2026-11-28T08:30Z'],
    ['one-digit fields', '2026-11-28T8:30'],
    ['an empty text', ''],
  ])('answers error "format" for %s', (_case, value) => {
    expect(parseLocalDateTime(value)).toEqual({ error: 'format' });
  });

  it.each([undefined, null, 20261128, ['2026-11-28T08:30']])(
    'answers error "format" for a non-text value: %j',
    (value) => {
      expect(parseLocalDateTime(value)).toEqual({ error: 'format' });
    },
  );

  it.each([
    ['31 November', '2026-11-31T08:30'],
    ['29 February of a common year', '2027-02-29T08:30'],
    ['month 13', '2026-13-01T08:30'],
    ['hour 24', '2026-11-28T24:00'],
    ['minute 60', '2026-11-28T08:60'],
    ['the hour skipped when summer time starts', '2027-03-28T02:30'],
  ])('answers error "invalid" for %s', (_case, value) => {
    expect(parseLocalDateTime(value)).toEqual({ error: 'invalid' });
  });
});
