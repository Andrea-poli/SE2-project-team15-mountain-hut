// Bookings, the tables they take and their party requirements: SQL only, no business rules (planning 4.4).
// Results are camelCase.

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
 * True if the hiker already has a confirmed booking for this slot (one per hiker per slot, MH-01).
 * Cancelled bookings do not count, like the index bookings_one_per_hiker_slot.
 */
export async function hasConfirmedBooking(db, slotId, hikerId) {
  const row = await db.get('SELECT 1 FROM bookings WHERE slot_id = ? AND hiker_id = ? AND status = ?', [
    slotId,
    hikerId,
    BOOKING_STATUS.CONFIRMED,
  ]);
  return Boolean(row);
}

/**
 * Inserts a booking, the seats it takes at each table and its party requirements (MH-05),
 * and returns it like findById.
 * Call it inside withTransaction (transaction.js), after re-reading the seats with allocationsForSlot:
 * the booking, its tables and its requirements are saved together or not at all.
 * A second confirmed booking of the same hiker in the same slot makes SQLite throw
 * 'UNIQUE constraint failed: bookings.slot_id, bookings.hiker_id' (index bookings_one_per_hiker_slot).
 * @param {{ slotId: number, hikerId: number, partySize: number, status?: string, createdAt: string,
 *           tables: { slotTableId: number, seats: number }[],
 *           requirements?: { hasAllergies: boolean, description: string }[] }} booking
 *        createdAt: ISO UTC, from now() of clock.js (never the real clock, so tests can fix it)
 *        requirements: already checked by the service (see saveRequirements); none when absent
 */
export async function create(
  db,
  { slotId, hikerId, partySize, status = BOOKING_STATUS.CONFIRMED, createdAt, tables, requirements = [] },
) {
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
  await saveRequirements(db, bookingId, requirements);
  return findById(db, bookingId);
}

/**
 * One booking with its slot, tables and party requirements, or null:
 *   { id, hikerId, slot: { id, date, startTime, endTime, label }, partySize,
 *     tables: [{ slotTableId, tableName, seats }], requirements: [{ hasAllergies, description }],
 *     status, createdAt }
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
    requirements: await findRequirements(db, id),
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Saves the party requirements of a booking (MH-05), in the order of the list.
 * Call it inside the transaction that saves the booking (withTransaction, transaction.js):
 * the booking and its requirements are saved together or not at all.
 * The service checks the values first: an empty description makes SQLite throw 'CHECK constraint failed'.
 * @param {{ hasAllergies: boolean, description: string }[]} requirements  may be empty
 */
export async function saveRequirements(db, bookingId, requirements) {
  for (const { hasAllergies, description } of requirements) {
    await db.run('INSERT INTO booking_requirements (booking_id, has_allergies, description) VALUES (?, ?, ?)', [
      bookingId,
      hasAllergies ? 1 : 0,
      description,
    ]);
  }
}

/**
 * The party requirements of a booking, in the order they were entered (openapi Requirement); [] when none.
 * @returns {Promise<{ hasAllergies: boolean, description: string }[]>}
 */
export async function findRequirements(db, bookingId) {
  const rows = await db.all(
    'SELECT has_allergies, description FROM booking_requirements WHERE booking_id = ? ORDER BY id',
    [bookingId],
  );
  return rows.map((row) => ({ hasAllergies: row.has_allergies === 1, description: row.description }));
}
