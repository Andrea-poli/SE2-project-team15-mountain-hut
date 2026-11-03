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

// Return a copy of a date shifted by a calendar-day count.
export function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

// Return a copy of the supplied date set to Monday midnight in the local timezone.
export function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

// Serialize local date parts as the API's YYYY-MM-DD format without UTC conversion.
export function toLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format an inclusive week range, omitting repeated month/year when possible.
// Example: "2026-11-02", "2026-11-08" → "2 – 8 Nov 2026".
// "2026-11-30", "2026-12-06" → "30 Nov – 6 Dec 2026".
export function formatWeekRange(start, end) {
  const formatPart = (date, options) => {
    const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(utcDate);
  };
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${formatPart(start, { day: 'numeric' })} – ${formatPart(end, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
  }
  if (sameYear) {
    return `${formatPart(start, { day: 'numeric', month: 'long' })} – ${formatPart(end, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
  }
  return `${formatPart(start, { day: 'numeric', month: 'long', year: 'numeric' })} – ${formatPart(end, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}
