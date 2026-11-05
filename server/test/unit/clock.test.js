import { afterEach, describe, expect, it } from 'vitest';
import { now, parseFakeNow, resetNow, setNow } from '../../src/clock.js';

describe('clock', () => {
  afterEach(() => {
    resetNow();
    delete process.env.FAKE_NOW;
  });

  it('returns the real time by default', () => {
    const before = Date.now();
    const value = now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  it('can be fixed in tests, in hut local time', () => {
    setNow('2026-11-02T10:00');
    expect(now().toISOString()).toBe('2026-11-02T09:00:00.000Z'); // Rome is UTC+1 in November
  });

  it('reads FAKE_NOW (used by E2E tests)', () => {
    process.env.FAKE_NOW = '2026-07-15T12:30';
    expect(now().toISOString()).toBe('2026-07-15T10:30:00.000Z'); // UTC+2 in summer
  });

  it('returns a copy, so callers cannot change the clock', () => {
    setNow('2026-11-02T10:00');
    now().setFullYear(2000);
    expect(now().getFullYear()).toBe(2026);
  });

  it('rejects invalid dates', () => {
    expect(() => setNow('not a date')).toThrow(TypeError);
  });

  it('refuses an invalid FAKE_NOW instead of returning an Invalid Date', () => {
    process.env.FAKE_NOW = '02/11/2026 10:00';
    expect(() => now()).toThrow(RangeError);
  });
});

describe('parseFakeNow', () => {
  it('reads YYYY-MM-DDTHH:mm in hut local time', () => {
    expect(parseFakeNow('2026-11-02T19:30').toISOString()).toBe('2026-11-02T18:30:00.000Z');
  });

  it('refuses a date without the time (JavaScript would read it as UTC midnight)', () => {
    expect(() => parseFakeNow('2026-11-02')).toThrow(/YYYY-MM-DDTHH:mm/);
  });

  it('refuses other formats and impossible days or times', () => {
    for (const value of ['02/11/2026', '2026-11-02 10:00', '2026-11-02T10:00Z', '2026-02-30T10:00', '2026-11-02T24:00', '']) {
      expect(() => parseFakeNow(value), value).toThrow(RangeError);
    }
  });
});
