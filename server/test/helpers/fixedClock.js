// Fixed clock for unit and integration tests.
//
//   import { useFixedClock } from '../helpers/fixedClock.js';
//   useFixedClock('2026-11-02T10:00'); // hut local time
import { afterEach, beforeEach } from 'vitest';
import { resetNow, setNow } from '../../src/clock.js';

export function useFixedClock(localDateTime) {
  beforeEach(() => setNow(localDateTime));
  afterEach(() => resetNow());
}
