// Bookings and the tables they take: SQL only, no business rules (planning 4.4). Results are camelCase.

/**
 * Values of bookings.status. No CHECK in schema.sql on purpose: a new state
 * (e.g. waiting, MH-16) is added here without rebuilding the table.
 */
export const BOOKING_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
});

/**
 * Seats already taken at each table of a slot, by confirmed bookings only
 * (cancelled ones free their seats). Tables with no seats taken are not listed.
 * Input of freeSeats() and allocate() in services/availability.js.
 * @returns {Promise<{ slotTableId: number, seats: number }[]>}
 */
export async function allocationsForSlot(db, slotId) {
  return db.all(
    `SELECT bt.slot_table_id AS slotTableId, SUM(bt.seats) AS seats
     FROM booking_tables bt JOIN bookings b ON b.id = bt.booking_id
     WHERE b.slot_id = ? AND b.status = ?
     GROUP BY bt.slot_table_id
     ORDER BY bt.slot_table_id`,
    [slotId, BOOKING_STATUS.CONFIRMED],
  );
}

/**
 * Inserts a booking and the seats it takes at each table, and returns it like findById.
 * Call it inside withTransaction (transaction.js), after re-reading the seats with allocationsForSlot:
 * the booking and its tables are saved together or not at all.
 * @param {{ slotId: number, hikerId: number, partySize: number, status?: string, createdAt: string,
 *           tables: { slotTableId: number, seats: number }[] }} booking
 *        createdAt: ISO UTC, from now() of clock.js (never the real clock, so tests can fix it)
 */
export async function create(db, { slotId, hikerId, partySize, status = BOOKING_STATUS.CONFIRMED, createdAt, tables }) {
  const { lastID: bookingId } = await db.run(
    'INSERT INTO bookings (slot_id, hiker_id, party_size, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [slotId, hikerId, partySize, status, createdAt],
  );
  for (const { slotTableId, seats } of tables) {
    await db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [
      bookingId,
      slotTableId,
      seats,
    ]);
  }
  return findById(db, bookingId);
}

/**
 * One booking with its slot and tables, or null:
 *   { id, hikerId, slot: { id, date, startTime, endTime, label }, partySize,
 *     tables: [{ slotTableId, tableName, seats }], status, createdAt }
 * hikerId lets the route check the owner (404 for someone else's booking): it is not part of the API answer.
 */
export async function findById(db, id) {
  const row = await db.get(
    `SELECT b.id, b.hiker_id, b.party_size, b.status, b.created_at,
            s.id AS slot_id, s.date, s.start_time, s.end_time, s.label
     FROM bookings b JOIN slots s ON s.id = b.slot_id
     WHERE b.id = ?`,
    [id],
  );
  if (!row) return null;

  const tables = await db.all(
    `SELECT bt.slot_table_id AS slotTableId, t.name AS tableName, bt.seats
     FROM booking_tables bt JOIN slot_tables t ON t.id = bt.slot_table_id
     WHERE bt.booking_id = ?
     ORDER BY bt.slot_table_id`,
    [id],
  );
  return {
    id: row.id,
    hikerId: row.hiker_id,
    slot: { id: row.slot_id, date: row.date, startTime: row.start_time, endTime: row.end_time, label: row.label },
    partySize: row.party_size,
    tables,
    status: row.status,
    createdAt: row.created_at,
  };
}
