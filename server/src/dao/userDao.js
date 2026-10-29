// Users: SQL only, no business rules (planning 4.4). Results are camelCase.
// The password hash is returned only by findCredentialsByEmail, for the login of U5:
// every other function returns the user as the API shows it, without the hash.

const USER_COLUMNS = 'id, email, first_name, last_name, phone, role';

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
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
 * For the login only: the user plus passwordHash (null for users who cannot log in).
 * Never send this object to the client.
 */
export async function findCredentialsByEmail(db, email) {
  const row = await db.get(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`, [email]);
  if (!row) return null;
  return { ...userFromRow(row), passwordHash: row.password_hash };
}

/**
 * Inserts a user and returns it (without the hash). A duplicated email makes SQLite throw
 * an error with code 'SQLITE_CONSTRAINT': the service turns it into 409.
 * @param {{ email?: string | null, passwordHash?: string | null, firstName: string,
 *           lastName?: string | null, phone?: string | null, role: 'hiker' | 'employee' | 'warden' }} user
 */
export async function create(db, { email = null, passwordHash = null, firstName, lastName = null, phone = null, role }) {
  const { lastID } = await db.run(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [email, passwordHash, firstName, lastName, phone, role],
  );
  return findById(db, lastID);
}
