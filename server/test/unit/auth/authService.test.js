import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as userDao from '../../../src/dao/userDao.js';
import {
  findUser,
  hashPassword,
  login,
  MESSAGES,
  MIN_PASSWORD_LENGTH,
  register,
  validateRegistration,
  verifyPassword,
} from '../../../src/services/authService.js';

const validRegistration = {
  firstName: ' Kilian ',
  lastName: ' Jornet ',
  email: ' kilian@example.com ',
  password: 'correct horse battery staple',
  phone: '+39 333 123 4567',
  notes: '  Mountain guide  ',
  emergencyContact: '  Grace Hopper  ',
};

beforeEach(async () => {
  const db = await getDb();
  await db.run('DELETE FROM users');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('password hashing', () => {
  it('creates a salted hash that can be verified without storing the password', async () => {
    const firstHash = await hashPassword('a secure password');
    const secondHash = await hashPassword('a secure password');

    expect(firstHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(secondHash).not.toBe(firstHash);
    await expect(verifyPassword('a secure password', firstHash)).resolves.toBe(true);
    await expect(verifyPassword('another password', firstHash)).resolves.toBe(false);
  });

  it.each([undefined, null, '', 'not-a-hash', ':missing-salt', 'missing-key:'])(
    'does not match a missing or malformed stored hash (%s)',
    async (storedHash) => {
      await expect(verifyPassword('password', storedHash)).resolves.toBe(false);
    },
  );

  it('uses the default key length when a malformed hex key decodes to no bytes', async () => {
    const storedHash = `${'00'.repeat(16)}:not-hex`;

    await expect(verifyPassword('password', storedHash)).resolves.toBe(false);
  });
});

describe('validateRegistration', () => {
  it('trims text fields, normalises the phone number, and defaults optional values to null', () => {
    expect(validateRegistration({
      ...validRegistration,
      notes: '   ',
      emergencyContact: undefined,
    })).toEqual({
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian@example.com',
      password: validRegistration.password,
      phone: '+393331234567',
      notes: null,
      emergencyContact: null,
    });
  });

  it.each([
    undefined,
    {},
    { ...validRegistration, firstName: '   ' },
    { ...validRegistration, lastName: null },
    { ...validRegistration, email: '' },
    { ...validRegistration, password: '   ' },
    { ...validRegistration, phone: '' },
  ])('requires all registration fields to contain text (%s)', (body) => {
    expect(() => validateRegistration(body)).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.registrationRequired }),
    );
  });

  it.each(['invalid', 'missing-domain@', 'missing-at.example.com'])('rejects invalid email addresses (%s)', (email) => {
    expect(() => validateRegistration({ ...validRegistration, email })).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidEmail }),
    );
  });

  it('rejects passwords shorter than the minimum length', () => {
    expect(() => validateRegistration({
      ...validRegistration,
      password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
    })).toThrow(expect.objectContaining({ status: 400, message: MESSAGES.shortPassword }));
  });

  it('rejects invalid phone numbers', () => {
    expect(() => validateRegistration({ ...validRegistration, phone: 'not a phone number' })).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidPhone }),
    );
  });

  it.each(['notes', 'emergencyContact'])('rejects non-text optional field %s', (field) => {
    expect(() => validateRegistration({ ...validRegistration, [field]: 123 })).toThrow(
      expect.objectContaining({ status: 400, message: MESSAGES.invalidOptional }),
    );
  });
});

describe('register', () => {
  it('creates a hiker with normalised details and a password hash, without returning the hash', async () => {
    const user = await register(validRegistration);

    expect(user).toMatchObject({
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian@example.com',
      phone: '+393331234567',
      role: 'hiker',
    });
    expect(user).not.toHaveProperty('passwordHash');

    const db = await getDb();
    const saved = await db.get('SELECT password_hash, notes, emergency_contact FROM users WHERE id = ?', [user.id]);
    expect(saved).toMatchObject({
      notes: 'Mountain guide',
      emergency_contact: 'Grace Hopper',
    });
    await expect(verifyPassword(validRegistration.password, saved.password_hash)).resolves.toBe(true);
  });

  it('rejects an email that is already registered', async () => {
    await register(validRegistration);

    await expect(register({ ...validRegistration, email: 'KILIAN@example.com' })).rejects.toMatchObject({
      status: 409,
      message: MESSAGES.emailInUse,
    });
  });

  it('converts a duplicate-email constraint race into the registration conflict', async () => {
    const duplicateError = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
      code: 'SQLITE_CONSTRAINT',
    });
    vi.spyOn(userDao, 'create').mockRejectedValueOnce(duplicateError);

    await expect(register(validRegistration)).rejects.toMatchObject({
      status: 409,
      message: MESSAGES.emailInUse,
    });
  });

  it('does not convert unrelated constraint errors into an email conflict', async () => {
    const unrelatedError = Object.assign(new Error('UNIQUE constraint failed: other_table.value'), {
      code: 'SQLITE_CONSTRAINT',
    });
    vi.spyOn(userDao, 'create').mockRejectedValueOnce(unrelatedError);

    await expect(register(validRegistration)).rejects.toBe(unrelatedError);
  });
});

describe('login', () => {
  it.each([
    undefined,
    {},
    { email: '  ', password: 'password' },
    { email: 'kilian@example.com', password: '' },
    { email: 'kilian@example.com', password: null },
  ])('requires a non-empty email and password (%s)', async (body) => {
    await expect(login(body)).rejects.toMatchObject({
      status: 400,
      message: MESSAGES.loginRequired,
    });
  });

  it('returns a user without the password hash for valid credentials', async () => {
    await register(validRegistration);

    const user = await login({ email: ' KILIAN@example.com ', password: validRegistration.password });

    expect(user).toMatchObject({
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian@example.com',
      phone: '+393331234567',
      role: 'hiker',
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('uses the same unauthorized response for unknown users, users without a password, and wrong passwords', async () => {
    const db = await getDb();
    await db.run('INSERT INTO users (email, first_name, role) VALUES (?, ?, ?)', [
      'temporary@example.com',
      'Temporary hiker',
      'hiker',
    ]);
    await register(validRegistration);

    for (const credentials of [
      { email: 'unknown@example.com', password: 'some password' },
      { email: 'temporary@example.com', password: 'some password' },
      { email: 'kilian@example.com', password: 'wrong password' },
    ]) {
      await expect(login(credentials)).rejects.toMatchObject({
        status: 401,
        message: MESSAGES.wrongCredentials,
      });
    }
  });
});

describe('findUser', () => {
  it('returns the session user or null if the user no longer exists', async () => {
    const user = await register(validRegistration);

    await expect(findUser(user.id)).resolves.toMatchObject({
      id: user.id,
      email: 'kilian@example.com',
      role: 'hiker',
    });
    await expect(findUser(-1)).resolves.toBeNull();
  });
});
