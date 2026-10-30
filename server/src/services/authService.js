// Registration and login (U5): validation, password hashing, users through userDao.
// Messages and status codes follow openapi.yaml (tag auth); the client mock (api/mocks/auth.js) uses the same ones.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js';
import { getDb } from '../dao/db.js';
import { withTransaction } from '../dao/transaction.js';
import * as userDao from '../dao/userDao.js';
import { BadRequest, Conflict, Unauthorized } from '../errors.js';

const scrypt = promisify(scryptCallback);

export const MIN_PASSWORD_LENGTH = 8;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// Same check as the client (utils/validation.js).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = {
  registrationRequired: 'First name, last name, email, password and mobile number are required',
  invalidEmail: 'Email is not valid',
  shortPassword: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  invalidPhone: 'Mobile number is not valid',
  invalidOptional: 'Notes and emergency contact must be text',
  emailInUse: 'Email already in use',
  loginRequired: 'Email and password are required',
  wrongCredentials: 'Invalid email or password',
};

// ---------- Passwords: salt + scrypt, stored as "salt:hash" in hex (users.password_hash) ----------

/** Hash for users.password_hash. Also used by the seed (U10) for the demo users. */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/** Compares in constant time. A missing or malformed stored hash never matches. */
export async function verifyPassword(password, stored) {
  const [saltHex, keyHex] = typeof stored === 'string' ? stored.split(':') : [];
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length || KEY_BYTES);
  return expected.length === key.length && timingSafeEqual(key, expected);
}

// Login with an unknown email still computes a hash, so the answer time does not tell whether
// the email is registered. Created at the first login, then reused.
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword('dummy-password-for-timing'));

// ---------- Validation ----------

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** E.164 ("+393331234567"), as the client sends it; spaces and dashes are accepted and removed. */
function normalisePhone(value) {
  if (!isValidPhoneNumber(value)) throw new BadRequest(MESSAGES.invalidPhone);
  return parsePhoneNumber(value).number;
}

// Optional free text: missing or blank → null; anything that is not text → 400.
function optionalText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequest(MESSAGES.invalidOptional);
  return value.trim() || null;
}

/**
 * Checks the registration body (NewUser in openapi.yaml) and returns the values to save:
 * text trimmed, email as typed (lookups ignore case), password as typed, phone in E.164.
 */
export function validateRegistration(body) {
  const { firstName, lastName, email, password, phone, notes, emergencyContact } = body ?? {};
  if (![firstName, lastName, email, password, phone].every(isText)) {
    throw new BadRequest(MESSAGES.registrationRequired);
  }
  if (!EMAIL_RE.test(email.trim())) throw new BadRequest(MESSAGES.invalidEmail);
  if (password.length < MIN_PASSWORD_LENGTH) throw new BadRequest(MESSAGES.shortPassword);
  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    password,
    phone: normalisePhone(phone),
    notes: optionalText(notes),
    emergencyContact: optionalText(emergencyContact),
  };
}

// ---------- Use cases ----------

const isDuplicatedEmail = (err) =>
  err?.code === 'SQLITE_CONSTRAINT' && /UNIQUE constraint failed: users\.email/.test(err.message);

/** Creates a hiker (web registration creates hikers only) and returns the user, without the hash. */
export async function register(body) {
  const { password, ...data } = validateRegistration(body);
  const passwordHash = await hashPassword(password); // slow: outside the transaction
  const db = await getDb();
  try {
    return await withTransaction(db, async () => {
      if (await userDao.findByEmail(db, data.email)) throw new Conflict(MESSAGES.emailInUse);
      return userDao.create(db, { ...data, passwordHash, role: 'hiker' });
    });
  } catch (err) {
    // Safety net for two registrations with the same email at the same time.
    if (isDuplicatedEmail(err)) throw new Conflict(MESSAGES.emailInUse);
    throw err;
  }
}

/** Returns the user when email and password match; the same 401 for a wrong email or password. */
export async function login(body) {
  const { email, password } = body ?? {};
  if (!isText(email) || typeof password !== 'string' || password === '') {
    throw new BadRequest(MESSAGES.loginRequired);
  }
  const db = await getDb();
  const found = await userDao.findCredentialsByEmail(db, email.trim());
  // Users without a password (temporary hikers, MH-07) cannot log in.
  const ok = await verifyPassword(password, found?.passwordHash ?? (await getDummyHash()));
  if (!found?.passwordHash || !ok) throw new Unauthorized(MESSAGES.wrongCredentials);
  const { passwordHash: _hash, ...user } = found;
  return user;
}

/** The user of a session, or null if it no longer exists. */
export async function findUser(id) {
  return userDao.findById(await getDb(), id);
}
