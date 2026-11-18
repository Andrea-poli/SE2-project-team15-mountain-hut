// Password reset links (MH-07): one row per link, keyed by the SHA-256 of its token (never the token itself).
// Times are ISO strings of now() (clock.js), so FAKE_NOW and the tests' fixed clock apply.

/** Saves a new link of `userId`; the links asked before stop working (only the newest one is valid). */
export async function replaceForUser(db, { tokenHash, userId, expiresAt }) {
  await db.run('DELETE FROM password_resets WHERE user_id = ?', [userId]);
  await db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
    tokenHash,
    userId,
    expiresAt,
  ]);
}

/** The user id of a link that is not used and not expired at `nowIso`, or null. */
export async function findValid(db, tokenHash, nowIso) {
  const row = await db.get(
    'SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    [tokenHash, nowIso],
  );
  return row ? row.user_id : null;
}

/** Marks a link as used; true only for the first call (a second request with the same link gets false). */
export async function markUsed(db, tokenHash, nowIso) {
  const { changes } = await db.run(
    'UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
    [nowIso, tokenHash],
  );
  return changes > 0;
}
