import { afterEach, describe, expect, it } from 'vitest';
import { now, resetNow, setNow } from '../../src/clock.js';

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
});
