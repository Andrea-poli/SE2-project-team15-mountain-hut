// Slot creation and time-derived slot state.
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

/**
 * Creates a slot and its tables atomically. Adjacent turns are allowed; an
 * overlap exists only when each slot starts before the other one ends.
 */
export async function createSlot(slot) {
  validateNewSlot(slot);
  const db = await getDb();

  return withTransaction(db, async (transactionDb) => {
    const sameDaySlots = await slotDao.findByDate(transactionDb, slot.date);
    const overlaps = sameDaySlots.some(
      (existing) => slot.startTime < existing.endTime && existing.startTime < slot.endTime,
    );
    if (overlaps) throw new Conflict(MESSAGES.overlap);

    return slotDao.create(transactionDb, {
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label.trim(),
      tables: slot.tables.map(({ name, seats }) => ({ name: name.trim(), seats })),
    });
  });
}
