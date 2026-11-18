// Users: SQL only, no business rules (planning 4.4). Results are camelCase.
// The password hash is returned only by findCredentialsByEmail, for the login of U5:
// every other function returns the user as the API shows it, without the hash.

const USER_COLUMNS = 'id, email, first_name, last_name, phone, role, must_change_password';

function userFromRow(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
  if (row.must_change_password === 1) user.mustChangePassword = true;
  return user;
}

/** @returns {Promise<object | null>} { id, firstName, lastName, email, phone, role } or null */
export async function findById(db, id) {
  return userFromRow(await db.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]));
}

/** Email match ignores upper and lower case (COLLATE NOCASE in schema.sql). Same shape as findById. */
export async function findByEmail(db, email) {
  return userFromRow(await db.get(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email]));
}

/**
 * Search hiker profiles for the staff panel. Phone matching ignores spaces;
 * temporary accounts are identifiable by their missing email and password.
 */
export async function searchHikers(db, query) {
  const rows = await db.all(
    `SELECT id, first_name, last_name, email, phone,
            email IS NULL AND password_hash IS NULL AS temporary
     FROM users
     WHERE role = 'hiker'
       AND (
         instr(lower(first_name), lower(?)) > 0
         OR instr(lower(coalesce(last_name, '')), lower(?)) > 0
         OR instr(lower(first_name || ' ' || coalesce(last_name, '')), lower(?)) > 0
         OR instr(lower(coalesce(last_name, '') || ' ' || first_name), lower(?)) > 0
         OR instr(lower(coalesce(email, '')), lower(?)) > 0
         OR instr(replace(coalesce(phone, ''), ' ', ''), replace(?, ' ', '')) > 0
       )
     ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
     LIMIT 20`,
    [query, query, query, query, query, query],
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    temporary: Boolean(row.temporary),
  }));
}

/**
 * For the login only: the user plus passwordHash (null for users who cannot log in).
 * Never send this object to the client.
 */
export async function findCredentialsByEmail(db, email) {
  const row = await db.get(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`, [email]);
  if (!row) return null;
  return { ...userFromRow(row), passwordHash: row.password_hash };
}

/**
 * Inserts a user and returns it like findById (without the hash; notes and emergencyContact are saved
 * but not returned, the API user object does not have them).
 * Every broken rule of schema.sql throws an error with code 'SQLITE_CONSTRAINT' (NOT NULL, role CHECK, …):
 * only the message 'UNIQUE constraint failed: users.email' means a duplicated email. The service (U5)
 * checks findByEmail first for its 409, and treats that message only as a safety net for two requests at once.
 * @param {{ email?: string | null, passwordHash?: string | null, firstName: string, lastName?: string | null,
 *           phone?: string | null, notes?: string | null, emergencyContact?: string | null,
 *           mustChangePassword?: boolean, role: 'hiker' | 'employee' | 'warden' }} user
 */
export async function create(
  db,
  {
    email = null,
    passwordHash = null,
    firstName,
    lastName = null,
    phone = null,
    notes = null,
    emergencyContact = null,
    mustChangePassword = false,
    role,
  },
) {
  const { lastID } = await db.run(
    `INSERT INTO users (
       email, password_hash, first_name, last_name, phone, notes, emergency_contact, role, must_change_password
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [email, passwordHash, firstName, lastName, phone, notes, emergencyContact, role, mustChangePassword ? 1 : 0],
  );
  return findById(db, lastID);
}

/** Replaces the password only if it has not changed since it was checked; also clears the forced-change flag. */
export async function updatePassword(db, id, expectedPasswordHash, passwordHash) {
  const { changes } = await db.run(
    `UPDATE users SET password_hash = ?, must_change_password = 0
     WHERE id = ? AND password_hash = ?`,
    [passwordHash, id, expectedPasswordHash],
  );
  return changes > 0;
}

/** Sets a new password chosen by the user (reset link, MH-07): the generated one, if any, no longer applies. */
export async function setPassword(db, id, passwordHash) {
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [passwordHash, id]);
}
