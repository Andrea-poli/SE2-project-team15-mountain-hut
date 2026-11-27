// MH-11 BT1 – unit tests of dateRange.js, the date checks shared by GET /api/slots, GET /api/public/slots and
// GET /api/public/meals (moved out of the routes in MH-11 BE1). Contract: valid calendar dates 'YYYY-MM-DD',
// inclusive range, `to` not before `from`, at most 31 days.
import { describe, expect, it } from 'vitest';
import { isValidDate, validateDateRange } from '../../src/dateRange.js';

describe('isValidDate', () => {
  it.each(['2026-11-02', '2026-12-31', '2028-02-29', '2027-01-01'])('accepts the calendar date %s', (value) => {
    expect(isValidDate(value)).toBe(true);
  });

  it.each([
    ['an impossible day', '2026-02-30'],
    ['29 February of a year that is not a leap year', '2027-02-29'],
    ['month 13', '2026-13-01'],
    ['day 00', '2026-11-00'],
    ['a one-digit month', '2026-1-05'],
    ['a date with a time', '2026-11-02T10:00'],
    ['spaces around it', ' 2026-11-02 '],
    ['text', 'today'],
    ['an empty text', ''],
  ])('refuses %s', (_case, value) => {
    expect(isValidDate(value)).toBe(false);
  });

  it.each([undefined, null, 20261102, ['2026-11-02']])('refuses a value that is not text: %j', (value) => {
    expect(isValidDate(value)).toBe(false);
  });
});

describe('validateDateRange', () => {
  it('accepts a one-day range, a range across months and years, and exactly 31 days', () => {
    expect(() => validateDateRange('2026-11-02', '2026-11-02')).not.toThrow();
    expect(() => validateDateRange('2026-12-28', '2027-01-03')).not.toThrow();
    expect(() => validateDateRange('2026-12-01', '2026-12-31')).not.toThrow();
    expect(() => validateDateRange('2028-02-01', '2028-03-02')).not.toThrow(); // 31 days with 29 February
  });

  it('refuses 32 days, with the message of the contract', () => {
    expect(() => validateDateRange('2026-12-01', '2027-01-01')).toThrow('The range cannot exceed 31 days');
    expect(() => validateDateRange('2026-12-01', '2027-01-01')).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('refuses `to` before `from`, and an invalid `from` or `to`, each with a 400', () => {
    for (const [from, to] of [
      ['2026-11-08', '2026-11-02'],
      ['2026-02-30', '2026-03-05'],
      ['2026-11-02', '2026-11-31'],
      [undefined, '2026-11-08'],
      ['2026-11-02', undefined],
    ]) {
      expect(() => validateDateRange(from, to), `${from}..${to}`).toThrow(expect.objectContaining({ status: 400 }));
    }
  });
});
