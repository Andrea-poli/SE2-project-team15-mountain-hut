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
  staffHikerRequired: 'First name, last name, email and mobile number are required',
  temporaryHikerNameRequired: 'firstName is required',
  loginRequired: 'Email and password are required',
  wrongCredentials: 'Invalid email or password',
  passwordChangeRequired: 'Current and new password are required',
  currentPasswordWrong: 'The current password is wrong',
  samePassword: 'New password must be different from the current password',
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
// the email is registered. Started when the module loads: creating it at the first login would make
// that one request twice as slow (two scrypt runs) and reveal the unknown email.
const dummyHash = hashPassword('dummy-password-for-timing');
const getDummyHash = () => dummyHash;

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

function validateHikerProfile(
  body,
  {
    requiredFields,
    requiredMessage,
    optionalLastName = false,
    optionalPhone = false,
  },
) {
  const { firstName, lastName, email, password, phone, notes, emergencyContact } = body ?? {};
  const fields = { firstName, lastName, email, password, phone };
  if (!requiredFields.every((field) => isText(fields[field]))) throw new BadRequest(requiredMessage);
  if (requiredFields.includes('email') && !EMAIL_RE.test(email.trim())) {
    throw new BadRequest(MESSAGES.invalidEmail);
  }
  if (requiredFields.includes('password') && password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequest(MESSAGES.shortPassword);
  }
  if (optionalLastName && lastName !== undefined && lastName !== null && typeof lastName !== 'string') {
    throw new BadRequest('lastName must be text');
  }
  if (optionalPhone && phone !== undefined && phone !== null && typeof phone !== 'string') {
    throw new BadRequest(MESSAGES.invalidPhone);
  }

  const normalizedLastName = typeof lastName === 'string' ? lastName.trim() || null : null;
  const normalizedPhone =
    optionalPhone && (typeof phone !== 'string' || !phone.trim()) ? null : normalisePhone(phone);
  const profile = {
    firstName: firstName.trim(),
    lastName: normalizedLastName,
    phone: normalizedPhone,
  };
  if (requiredFields.includes('email')) profile.email = email.trim();
  if (requiredFields.includes('password')) profile.password = password;
  if (requiredFields.includes('email')) {
    profile.notes = optionalText(notes);
    profile.emergencyContact = optionalText(emergencyContact);
  }
  return profile;
}

/** Checks NewUser fields; text is trimmed, email kept as typed, password as typed, phone in E.164. */
export function validateRegistration(body) {
  return validateHikerProfile(body, {
    requiredFields: ['firstName', 'lastName', 'email', 'password', 'phone'],
    requiredMessage: MESSAGES.registrationRequired,
  });
}

/** Full profile entered by staff. The password is generated by the server, not included in the body. */
export function validateStaffHiker(body) {
  return validateHikerProfile(body, {
    requiredFields: ['firstName', 'lastName', 'email', 'phone'],
    requiredMessage: MESSAGES.staffHikerRequired,
  });
}

/** Minimal walk-in profile with no email or password, so the hiker cannot log in. */
export function validateTemporaryHiker(body) {
  return validateHikerProfile(body, {
    requiredFields: ['firstName'],
    requiredMessage: MESSAGES.temporaryHikerNameRequired,
    optionalLastName: true,
    optionalPhone: true,
  });
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

/** Changes the logged-in user's password and clears the forced-change flag. */
export async function changePassword(user, body) {
  const { currentPassword, newPassword } = body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    currentPassword === '' ||
    typeof newPassword !== 'string' ||
    newPassword === ''
  ) {
    throw new BadRequest(MESSAGES.passwordChangeRequired);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest(MESSAGES.shortPassword);

  const db = await getDb();
  const found = await userDao.findCredentialsByEmail(db, user.email);
  if (!found?.passwordHash || !(await verifyPassword(currentPassword, found.passwordHash))) {
    throw new Unauthorized(MESSAGES.currentPasswordWrong);
  }
  if (currentPassword === newPassword) throw new BadRequest(MESSAGES.samePassword);

  const passwordHash = await hashPassword(newPassword);
  if (!(await userDao.updatePassword(db, user.id, found.passwordHash, passwordHash))) {
    throw new Unauthorized(MESSAGES.currentPasswordWrong);
  }
  return userDao.findById(db, user.id);
}

/** The user of a session, or null if it no longer exists. */
export async function findUser(id) {
  return userDao.findById(await getDb(), id);
}
