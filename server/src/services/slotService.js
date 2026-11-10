// Slot creation, copy of a week (MH-09) and time-derived slot state.
import { now } from '../clock.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import { withTransaction } from '../dao/transaction.js';
import { BadRequest, Conflict } from '../errors.js';

const MESSAGES = {
  invalidSlot: 'Slot details are required',
  endBeforeStart: 'endTime must be after startTime',
  slotStarted: 'Slot must start in the future',
  noTables: 'A slot needs at least one table',
  invalidTable: 'Each table needs a name and a positive number of seats',
  duplicateTableNames: 'Table names must be unique within the slot',
  overlap: 'Overlaps an existing slot',
  sameWeek: 'Choose a different week to copy into',
};

/**
 * Whether the slot's start has arrived or passed, using the hut-local clock.
 * The slot shape is { date: 'YYYY-MM-DD', startTime: 'HH:MM' }.
 */
export function hasStarted(slot) {
  const current = now();
  const [year, month, day] = slot.date.split('-').map(Number);
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  const start = new Date(year, month - 1, day, hours, minutes);
  return start.getTime() <= current.getTime();
}

function validateNewSlot(slot) {
  if (!slot || typeof slot !== 'object') throw new BadRequest(MESSAGES.invalidSlot);
  const { date, startTime, endTime, tables } = slot;

  if (endTime <= startTime) throw new BadRequest(MESSAGES.endBeforeStart);
  if (hasStarted({ date, startTime })) throw new BadRequest(MESSAGES.slotStarted);
  if (!Array.isArray(tables) || tables.length === 0) throw new BadRequest(MESSAGES.noTables);

  const names = new Set();
  for (const table of tables) {
    if (
      !table ||
      typeof table.name !== 'string' ||
      table.name.trim() === '' ||
      !Number.isInteger(table.seats) ||
      table.seats <= 0
    ) {
      throw new BadRequest(MESSAGES.invalidTable);
    }
    const name = table.name.trim();
    if (names.has(name)) throw new BadRequest(MESSAGES.duplicateTableNames);
    names.add(name);
  }
}

/** True when two slots of the same day overlap. Adjacent turns (one ends when the other starts) do not. */
function overlap(a, b) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Creates a slot and its tables atomically. Adjacent turns are allowed; an
 * overlap exists only when each slot starts before the other one ends.
 */
export async function createSlot(slot) {
  validateNewSlot(slot);
  const db = await getDb();

  return withTransaction(db, async (transactionDb) => {
    const sameDaySlots = await slotDao.findByDate(transactionDb, slot.date);
    if (sameDaySlots.some((existing) => overlap(slot, existing))) throw new Conflict(MESSAGES.overlap);

    return slotDao.create(transactionDb, {
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label.trim(),
      tables: slot.tables.map(({ name, seats }) => ({ name: name.trim(), seats })),
    });
  });
}

// ---------------------------------------------------------------- MH-09: copy a week

const DAY_MS = 86_400_000;

// Calendar arithmetic on 'YYYY-MM-DD' strings, in UTC: a day is always 24 h, so a DST change never moves a date.
const toDay = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS;
const fromDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Monday ('YYYY-MM-DD') of the week of a date: weeks are Monday to Sunday. */
function mondayOf(isoDate) {
  const day = toDay(isoDate);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return fromDay(day - weekday);
}

/**
 * Copies every slot of the week of `from`, with its tables, into the week of `to` (MH-09). Each slot keeps
 * its weekday, times and label; bookings are never copied. A slot is skipped, with its reason, when it would
 * not start in the future ('past') or when it overlaps a slot already there on that day. Everything is saved in one transaction.
 * @param {string} from any date of the source week ('YYYY-MM-DD', already validated)
 * @param {string} to any date of the target week
 * @returns {Promise<{ created: object[], skipped: { date, startTime, endTime, label, reason }[] }>}
 */
export async function copyWeek(from, to) {
  const sourceMonday = mondayOf(from);
  const targetMonday = mondayOf(to);
  if (sourceMonday === targetMonday) throw new BadRequest(MESSAGES.sameWeek);
  const shift = toDay(targetMonday) - toDay(sourceMonday); // days between the two weeks
  const sunday = (monday) => fromDay(toDay(monday) + 6);

  const db = await getDb();
  return withTransaction(db, async (transactionDb) => {
    const sourceSlots = await slotDao.findInRange(transactionDb, sourceMonday, sunday(sourceMonday));
    // The slots already in the target week, and the ones this copy creates: both block an overlapping copy.
    const targetSlots = await slotDao.findInRange(transactionDb, targetMonday, sunday(targetMonday));
    const created = [];
    const skipped = [];

    for (const source of sourceSlots) {
      const copy = {
        date: fromDay(toDay(source.date) + shift),
        startTime: source.startTime,
        endTime: source.endTime,
        label: source.label,
      };
      let reason = null;
      if (hasStarted(copy)) reason = 'past';
      else if (targetSlots.some((other) => other.date === copy.date && overlap(copy, other))) reason = 'overlap';

      if (reason) {
        skipped.push({ ...copy, reason });
      } else {
        const tables = source.tables.map(({ name, seats }) => ({ name, seats }));
        const slot = await slotDao.create(transactionDb, { ...copy, tables });
        created.push(slot);
        targetSlots.push(slot);
      }
    }
    return { created, skipped };
  });
}
