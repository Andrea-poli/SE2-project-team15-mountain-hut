// Hikes registered by hikers (MH-20 BE1): validation, the hut-local clock, the state of a hike.
// Messages and status codes follow openapi.yaml (POST /api/hikes). The SQL is in hikeDao.js.
// departureAt and expectedReturnAt are hut-local 'YYYY-MM-DDTHH:MM', so they compare as text (like the DAO).
import { now } from '../clock.js';
import { getDb } from '../dao/db.js';
import * as hikeDao from '../dao/hikeDao.js';
import { BadRequest } from '../errors.js';

// Length limits after trimming (openapi.yaml NewHike, team choice).
const MAX_LENGTH = { destination: 100, route: 500, passagePoints: 500 };

export const MESSAGES = {
  pastDeparture: 'The departure cannot be in the past',
  returnBeforeDeparture: 'expectedReturnAt must be after departureAt',
};

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n) => String(n).padStart(2, '0');

/** A Date as hut-local 'YYYY-MM-DDTHH:MM' (config.js sets TZ to the hut's time zone). */
export function localDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * True for a real hut-local date and time written as YYYY-MM-DDTHH:MM. new Date() silently moves impossible values
 * (31 Nov → 1 Dec, 25:00 → next day, the hour skipped by daylight saving time), so the value must come back the same.
 */
function isValidDateTime(value) {
  const match = typeof value === 'string' && DATE_TIME.exec(value);
  if (!match) return false;
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  return localDateTime(new Date(year, month - 1, day, hours, minutes)) === value;
}

/** A required text: trimmed, not empty, at most MAX_LENGTH[field] characters. */
function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') throw new BadRequest(`${field} is required`);
  if (text.length > MAX_LENGTH[field]) throw new BadRequest(`${field} must be at most ${MAX_LENGTH[field]} characters`);
  return text;
}

/** An optional text: missing, null or empty after trimming → null. */
function optionalText(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequest(`${field} must be text`);
  const text = value.trim();
  if (text.length > MAX_LENGTH[field]) throw new BadRequest(`${field} must be at most ${MAX_LENGTH[field]} characters`);
  return text === '' ? null : text;
}

function dateTime(value, field) {
  if (!isValidDateTime(value)) throw new BadRequest(`${field} must be YYYY-MM-DDTHH:MM`);
  return value;
}

/**
 * Body of POST /api/hikes → { destination, route, passagePoints, departureAt, expectedReturnAt }, or 400.
 * The departure may be the current minute (`nowLocal`), not earlier.
 */
export function validateNewHike(body, nowLocal) {
  const fields = body !== null && typeof body === 'object' ? body : {};
  const hike = {
    destination: requiredText(fields.destination, 'destination'),
    route: requiredText(fields.route, 'route'),
    passagePoints: optionalText(fields.passagePoints, 'passagePoints'),
    departureAt: dateTime(fields.departureAt, 'departureAt'),
    expectedReturnAt: dateTime(fields.expectedReturnAt, 'expectedReturnAt'),
  };
  if (hike.departureAt < nowLocal) throw new BadRequest(MESSAGES.pastDeparture);
  if (hike.expectedReturnAt <= hike.departureAt) throw new BadRequest(MESSAGES.returnBeforeDeparture);
  return hike;
}

/** planned before the departure, inProgress from the departure (included), completed once confirmed (MH-22). */
export function hikeState(hike, nowLocal) {
  if (hike.completedAt) return 'completed';
  return hike.departureAt <= nowLocal ? 'inProgress' : 'planned';
}

/** A hike of hikeDao as the hiker sees it (openapi.yaml Hike): with its state, without hikerId. */
export function toHike(hike, nowLocal) {
  const { id, destination, route, passagePoints, departureAt, expectedReturnAt, completedAt, createdAt } = hike;
  return {
    id,
    destination,
    route,
    passagePoints,
    departureAt,
    expectedReturnAt,
    state: hikeState(hike, nowLocal),
    completedAt,
    createdAt,
  };
}

/**
 * Registers a planned hike for `hiker` (MH-20). No booking at the hut is needed and a hiker may have more than one
 * hike (pending PO, planning question 4). Returns the new hike: planned, or inProgress when it leaves this minute.
 * @param {{ id: number }} hiker the logged-in hiker
 * @param {unknown} body { destination, route, passagePoints?, departureAt, expectedReturnAt }
 * @throws {BadRequest} invalid body, departure in the past, expected return not after the departure
 */
export async function registerHike(hiker, body) {
  const current = now();
  const nowLocal = localDateTime(current);
  const hike = validateNewHike(body, nowLocal);
  const saved = await hikeDao.create(await getDb(), {
    ...hike,
    hikerId: hiker.id,
    createdAt: current.toISOString(),
  });
  return toHike(saved, nowLocal);
}
