// Display formats shared by every page. The language is fixed on purpose:
// the output does not depend on the browser language or time zone.

// 'en-GB' because 'en-US' would give "Mon, Nov 2"; timeZone 'UTC' so the local zone never shifts the day.
// Created once: building a formatter is expensive.
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

// "2026-11-02" → "Mon 2 Nov". The date is built from its parts, never parsed from the string.
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return DATE_FORMAT.format(Date.UTC(year, month - 1, day));
}

// "12:00", "14:00" → "12:00 – 14:00" (en dash with spaces).
export function formatTimeRange(start, end) {
  return `${start} – ${end}`;
}
