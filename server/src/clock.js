// The only source of "now" for the server (planning 4.3, A6).
// Time rules (e.g. the 2-hour booking deadline) belong to the stories, not to this file.
//
// - Unit tests: setNow('2026-11-02T10:00') / resetNow()
// - E2E tests and demos: env variable FAKE_NOW (checked at startup by config.js)

let fixedNow = null;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Reads a hut-local date and time written as YYYY-MM-DDTHH:mm (FAKE_NOW, hikes of MH-20).
 * new Date() silently moves impossible values (31 Nov → 1 Dec, 25:00 → next day, the hour skipped by daylight
 * saving time), so the fields must come back the same.
 * @returns {{ date: Date } | { error: 'format' | 'invalid' }}
 */
export function parseLocalDateTime(value) {
  const match = typeof value === 'string' && LOCAL_DATE_TIME.exec(value);
  if (!match) return { error: 'format' };
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  const sameFields =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes;
  return sameFields ? { date } : { error: 'invalid' };
}

/**
 * Parses FAKE_NOW: a day and a time in hut local time, written as YYYY-MM-DDTHH:mm.
 * A date without the time is refused: JavaScript would read it as UTC midnight (01:00 in Rome).
 */
export function parseFakeNow(value) {
  const { date, error } = parseLocalDateTime(value);
  if (error === 'format') {
    throw new RangeError(`FAKE_NOW must be written as YYYY-MM-DDTHH:mm in hut local time, got "${value}"`);
  }
  if (error) throw new RangeError(`FAKE_NOW is not a valid day and time: "${value}"`);
  return date;
}

export function now() {
  if (fixedNow) return new Date(fixedNow);
  if (process.env.FAKE_NOW) return parseFakeNow(process.env.FAKE_NOW);
  return new Date();
}

export function setNow(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError(`Invalid date: ${date}`);
  fixedNow = value;
}

export function resetNow() {
  fixedNow = null;
}
