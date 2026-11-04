// The tests run with TZ=Europe/Rome (vite.config.js), like the hut.
import { describe, expect, it } from 'vitest';
import { isIsoDate, toIsoDate } from '../../../src/utils/dates.js';

describe('toIsoDate', () => {
  it('pads month and day with a zero', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 10, 12))).toBe('2026-11-12');
  });

  it('gives the local day, not the UTC one, close to midnight', () => {
    // 00:30 in Rome is still the day before in UTC.
    const justAfterMidnight = new Date(2026, 10, 3, 0, 30);
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(toIsoDate(justAfterMidnight)).toBe('2026-11-03');
    expect(toIsoDate(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });
});

describe('isIsoDate', () => {
  it('accepts a real day written as YYYY-MM-DD', () => {
    expect(isIsoDate('2026-11-03')).toBe(true);
    expect(isIsoDate('2026-12-31')).toBe(true);
  });

  it('knows the leap years', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', '03/11/2026', 'ciao', '', null, undefined])(
    'refuses %j',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );
});
