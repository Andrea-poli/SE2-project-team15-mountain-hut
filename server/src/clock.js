// The only source of "now" for the server (planning 4.3, A6).
// Time rules (e.g. the 2-hour booking deadline) belong to the stories, not to this file.
//
// - Unit tests: setNow('2026-11-02T10:00') / resetNow()
// - E2E tests and demos: env variable FAKE_NOW (checked at startup by config.js)

let fixedNow = null;

const FAKE_NOW_FORMAT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parses FAKE_NOW: a day and a time in hut local time, written as YYYY-MM-DDTHH:mm.
 * A date without the time is refused: JavaScript would read it as UTC midnight (01:00 in Rome).
 */
export function parseFakeNow(value) {
  const match = FAKE_NOW_FORMAT.exec(value);
  if (!match) {
    throw new RangeError(`FAKE_NOW must be written as YYYY-MM-DDTHH:mm in hut local time, got "${value}"`);
  }
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  // new Date() silently moves impossible dates (31 Nov → 1 Dec, 25:00 → next day): refuse them.
  const sameFields =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes;
  if (!sameFields) {
    throw new RangeError(`FAKE_NOW is not a valid day and time: "${value}"`);
  }
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
