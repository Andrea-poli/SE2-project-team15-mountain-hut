// Calendar dates in query strings ('YYYY-MM-DD', hut local dates): shared by the routes that read them.
// Moved here from routes/slots.js and routes/publicSlots.js (MH-11 BE1 is the third route that needs them).
import { BadRequest } from './errors.js';

const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' that exists on the calendar (2026-02-30 does not). */
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Checks an inclusive range `from`..`to` of calendar dates, at most 31 days (openapi: GET /api/slots,
 * GET /api/public/meals). Throws BadRequest with the reason, so the route answers 400.
 */
export function validateDateRange(from, to) {
  if (!isValidDate(from)) throw new BadRequest('from must be a valid calendar date');
  if (!isValidDate(to)) throw new BadRequest('to must be a valid calendar date');
  if (to < from) throw new BadRequest('to must be on or after from');

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) throw new BadRequest(`The range cannot exceed ${MAX_RANGE_DAYS} days`);
}
