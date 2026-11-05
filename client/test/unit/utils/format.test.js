import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { formatDate, formatTimeRange, formatWeekRange } from '../../../src/utils/format.js';

describe('formatDate', () => {
  it('writes a date as "Mon 2 Nov"', () => {
    expect(formatDate('2026-11-02')).toBe('Mon 2 Nov');
  });

  it('keeps the right day at month and year changes', () => {
    expect(formatDate('2026-10-31')).toBe('Sat 31 Oct');
    expect(formatDate('2026-12-31')).toBe('Thu 31 Dec');
    expect(formatDate('2027-01-01')).toBe('Fri 1 Jan');
  });

  it('handles the leap day and the daylight saving change', () => {
    expect(formatDate('2028-02-29')).toBe('Tue 29 Feb');
    // Clocks change in Rome on these days: the date must not move.
    expect(formatDate('2026-03-29')).toBe('Sun 29 Mar');
    expect(formatDate('2026-10-25')).toBe('Sun 25 Oct');
  });

  it('does not depend on the time zone of the browser', async () => {
    const original = process.env.TZ;
    try {
      // West of UTC the midnight of Date.UTC is still the day before: the day must not move.
      for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        vi.resetModules(); // the formatter is created when the module loads, in the current zone
        const { formatDate: format } = await import('../../../src/utils/format.js');
        expect(format('2026-11-02'), tz).toBe('Mon 2 Nov');
      }
    } finally {
      process.env.TZ = original;
      vi.resetModules();
    }
  });
});

describe('formatTimeRange', () => {
  it('joins start and end with a spaced en dash', () => {
    expect(formatTimeRange('12:00', '14:00')).toBe('12:00 – 14:00');
  });
});

describe('formatWeekRange', () => {
  it('writes the month and the year once when they are the same', () => {
    expect(formatWeekRange(new Date(2026, 10, 2), new Date(2026, 10, 8))).toBe('2 – 8 Nov 2026');
  });

  it('writes both months over a change of month', () => {
    expect(formatWeekRange(new Date(2026, 10, 30), new Date(2026, 11, 6))).toBe('30 Nov – 6 Dec 2026');
  });

  it('writes both years over a change of year', () => {
    expect(formatWeekRange(new Date(2026, 11, 28), new Date(2027, 0, 3))).toBe('28 Dec 2026 – 3 Jan 2027');
  });
});
