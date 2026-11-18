// Staff hiker search and account preparation (MH-07).
import { randomInt } from 'node:crypto';
import { Conflict } from '../errors.js';
import { getDb } from '../dao/db.js';
import * as userDao from '../dao/userDao.js';
import { hashPassword, validateStaffHiker, validateTemporaryHiker } from './authService.js';

const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function searchHikers(query) {
  return userDao.searchHikers(await getDb(), query);
}

/** Prepare a full hiker before the booking transaction; the generated password is returned only to its caller. */
export async function prepareFullHiker(body) {
  const profile = validateStaffHiker(body);
  const generatedPassword = Array.from(
    { length: 12 },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
  ).join('');
  const passwordHash = await hashPassword(generatedPassword);
  return { ...profile, passwordHash, mustChangePassword: true, generatedPassword };
}

/** Prepare a temporary hiker; no email or password is created. */
export function prepareTemporaryHiker(body) {
  return { ...validateTemporaryHiker(body), email: null, passwordHash: null, mustChangePassword: false };
}

/**
 * Persist a prepared hiker using the caller's transaction connection, so a later staff-booking flow can
 * create the user and booking atomically. This function does not start or commit a transaction.
 */
export async function createPreparedHiker(db, prepared) {
  try {
    if (prepared.email && (await userDao.findByEmail(db, prepared.email))) {
      throw new Conflict('Email already in use');
    }
    const { generatedPassword, ...userData } = prepared;
    const hiker = await userDao.create(db, { ...userData, role: 'hiker' });
    return generatedPassword ? { hiker, generatedPassword } : { hiker };
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT' && /UNIQUE constraint failed: users\.email/.test(err.message)) {
      throw new Conflict('Email already in use');
    }
    throw err;
  }
}
