// Hikes registered by hikers (MH-20, MH-21, MH-22): SQL only, no business rules (planning 4.4). Results are camelCase.
// departureAt and expectedReturnAt are hut-local 'YYYY-MM-DDTHH:MM' (contract), so they compare as text.
// completedAt and createdAt are ISO strings of now() (clock.js). The `state` of a hike (planned, inProgress,
// completed) depends on the clock and is computed by the service, not here.
//
// Every function returns hikes in the same shape:
//   { id, hikerId, destination, route, passagePoints, departureAt, expectedReturnAt, completedAt, createdAt }
// findActive adds the hiker: { id, firstName, lastName, email, phone, notes, emergencyContact }.

const HIKE_COLUMNS = `h.id, h.hiker_id, h.destination, h.route, h.passage_points, h.departure_at,
  h.expected_return_at, h.completed_at, h.created_at`;

function hikeFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    hikerId: row.hiker_id,
    destination: row.destination,
    route: row.route,
    passagePoints: row.passage_points,
    departureAt: row.departure_at,
    expectedReturnAt: row.expected_return_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/** @returns {Promise<object | null>} the hike, or null */
export async function findById(db, id) {
  return hikeFromRow(await db.get(`SELECT ${HIKE_COLUMNS} FROM hikes h WHERE h.id = ?`, [id]));
}

/**
 * Saves a new hike and returns it like findById. The texts are saved as given: trimming, empty passage points
 * as null and the length limits belong to the service (empty texts are refused by the schema).
 * @param {{ hikerId: number, destination: string, route: string, passagePoints?: string | null,
 *           departureAt: string, expectedReturnAt: string, createdAt: string }} hike
 */
export async function create(db, { hikerId, destination, route, passagePoints = null, departureAt, expectedReturnAt,
  createdAt }) {
  const { lastID } = await db.run(
    `INSERT INTO hikes (hiker_id, destination, route, passage_points, departure_at, expected_return_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [hikerId, destination, route, passagePoints, departureAt, expectedReturnAt, createdAt],
  );
  return findById(db, lastID);
}

/**
 * Every hike of one hiker, for "My hikes" (MH-20): first the ones not completed (soonest departure first),
 * then the completed ones (most recent departure first).
 */
export async function findByHiker(db, hikerId) {
  const rows = await db.all(
    `SELECT ${HIKE_COLUMNS} FROM hikes h
     WHERE h.hiker_id = ?
     ORDER BY h.completed_at IS NOT NULL,
              CASE WHEN h.completed_at IS NULL THEN h.departure_at END,
              h.departure_at DESC,
              h.id`,
    [hikerId],
  );
  return rows.map(hikeFromRow);
}

/**
 * The hikes started at `nowLocal` (hut-local 'YYYY-MM-DDTHH:MM', departure included) and not completed, also
 * after their expected return (MH-21), with the hiker's details. Earliest expected return first.
 */
export async function findActive(db, nowLocal) {
  const rows = await db.all(
    `SELECT ${HIKE_COLUMNS}, u.first_name, u.last_name, u.email, u.phone, u.notes, u.emergency_contact
     FROM hikes h JOIN users u ON u.id = h.hiker_id
     WHERE h.completed_at IS NULL AND h.departure_at <= ?
     ORDER BY h.expected_return_at, h.departure_at, h.id`,
    [nowLocal],
  );
  return rows.map((row) => ({
    ...hikeFromRow(row),
    hiker: {
      id: row.hiker_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      emergencyContact: row.emergency_contact,
    },
  }));
}

/**
 * Marks a hike as completed at `completedAt` (MH-22). True only for the first call: a hike already completed
 * (or an unknown id) gives false and keeps its first completedAt.
 */
export async function complete(db, id, completedAt) {
  const { changes } = await db.run('UPDATE hikes SET completed_at = ? WHERE id = ? AND completed_at IS NULL', [
    completedAt,
    id,
  ]);
  return changes > 0;
}
