// Slots and their tables: SQL only, no business rules (planning 4.4). Results are camelCase.
// Every function returns slots with their tables, in the same shape:
//   { id, date, startTime, endTime, label, status, tables: [{ id, name, seats }] }
// Slots are ordered by date and start time, tables in the order they were entered (id).
// Rules such as "open slots only", the 2 h deadline, `past` or the overlap check belong to the services.

const SLOT_COLUMNS = 's.id, s.date, s.start_time, s.end_time, s.label, s.status';

function slotFromRow(row, tables) {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    label: row.label,
    status: row.status,
    tables,
  };
}

/**
 * Reads the slots matching `where` and their tables with two queries (not one per slot).
 * `where` is a condition on the slots table, alias s, with ? placeholders for params.
 */
async function findSlots(db, where, params) {
  const rows = await db.all(
    `SELECT ${SLOT_COLUMNS} FROM slots s WHERE ${where} ORDER BY s.date, s.start_time, s.id`,
    params,
  );
  if (rows.length === 0) return [];

  const tableRows = await db.all(
    `SELECT t.id, t.slot_id, t.name, t.seats
     FROM slot_tables t JOIN slots s ON s.id = t.slot_id
     WHERE ${where}
     ORDER BY t.id`,
    params,
  );
  const tablesBySlot = new Map(rows.map((row) => [row.id, []]));
  for (const { id, slot_id: slotId, name, seats } of tableRows) {
    tablesBySlot.get(slotId).push({ id, name, seats });
  }
  return rows.map((row) => slotFromRow(row, tablesBySlot.get(row.id)));
}

/** @returns {Promise<object | null>} the slot with its tables, or null */
export async function findById(db, id) {
  const [slot] = await findSlots(db, 's.id = ?', [id]);
  return slot ?? null;
}

/** All the slots of one day ('YYYY-MM-DD'), any status. */
export async function findByDate(db, date) {
  return findSlots(db, 's.date = ?', [date]);
}

/** All the slots from `from` to `to` included ('YYYY-MM-DD'), any status. */
export async function findInRange(db, from, to) {
  return findSlots(db, 's.date BETWEEN ? AND ?', [from, to]);
}

/**
 * Inserts a slot and its tables and returns it like findById.
 * Call it inside withTransaction (transaction.js), together with the overlap check of the service:
 * the slot and its tables are saved together or not at all.
 * @param {{ date: string, startTime: string, endTime: string, label: string,
 *           status?: 'open' | 'closed', tables: { name: string, seats: number }[] }} slot
 */
export async function create(db, { date, startTime, endTime, label, status = 'open', tables }) {
  const { lastID: slotId } = await db.run(
    'INSERT INTO slots (date, start_time, end_time, label, status) VALUES (?, ?, ?, ?, ?)',
    [date, startTime, endTime, label, status],
  );
  for (const { name, seats } of tables) {
    await db.run('INSERT INTO slot_tables (slot_id, name, seats) VALUES (?, ?, ?)', [slotId, name, seats]);
  }
  return findById(db, slotId);
}
