// Date and time helpers for forms, in hut local time (the browser runs in Europe/Rome for the
// hut; tests and E2E fix the time zone too). Pure functions: the caller passes "now".

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date of `date` as YYYY-MM-DD (never toISOString: that is UTC and can give yesterday). */
export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a real calendar day written as YYYY-MM-DD ("2026-02-30" is false). */
export function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
