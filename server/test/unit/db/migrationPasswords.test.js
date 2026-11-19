// MH-07 FT2 – migration seen from the passwords: a database left by sprint 2 (schema version 2: schema.sql plus
// the booking requirements of U2) is upgraded when the server opens it.
//
// CONTRACT
//   B5 After the upgrade: the current schema version; every existing user keeps their data and login, with
//      mustChangePassword off (only hikers created by staff from now on get it, User schema); the table of the
//      reset links exists, empty, keyed by the token hash, and its rows go with their user.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../../src/config.js';
import { openDatabase, SCHEMA_VERSION } from '../../../src/dao/db.js';
import * as userDao from '../../../src/dao/userDao.js';
import { hashPassword, verifyPassword } from '../../../src/services/authService.js';

const file = path.join(path.dirname(config.dbPath), 'sprint-2-users.db');

// Step 2 as sprint 2 applied it (db.js MIGRATIONS[0]): a version-2 file is schema.sql plus this.
const VERSION_TWO_STEP = `CREATE TABLE booking_requirements (
     id            INTEGER PRIMARY KEY,
     booking_id    INTEGER NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
     has_allergies INTEGER NOT NULL CHECK (has_allergies IN (0, 1)),
     description   TEXT NOT NULL CHECK (trim(description) <> '')
   );
   CREATE INDEX booking_requirements_by_booking ON booking_requirements (booking_id, id);`;

let passwordHash;
let db;

async function writeVersionTwo() {
  const schema = await readFile(new URL('../../../src/dao/schema.sql', import.meta.url), 'utf8');
  passwordHash = await hashPassword('hikerpass');
  const data = `
    INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role)
      VALUES (1, 'hannah@example.com', '${passwordHash}', 'Hannah', 'Hiker', '+393331111111', 'hiker'),
             (2, 'employee@example.com', '${passwordHash}', 'Eric', 'Employee', NULL, 'employee'),
             (3, NULL, NULL, 'Giulia', NULL, NULL, 'hiker');`;
  await new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(file, (openErr) => {
      if (openErr) return reject(openErr);
      conn.exec(`${schema} ${VERSION_TWO_STEP} PRAGMA user_version = 2; ${data}`, (err) =>
        conn.close((closeErr) => (err || closeErr ? reject(err || closeErr) : resolve())),
      );
    });
  });
}

beforeEach(async () => {
  await rm(file, { force: true });
  await writeVersionTwo();
});

afterEach(async () => {
  await db?.close();
  db = null;
  await rm(file, { force: true });
});

describe('a sprint 2 database opened by this server', () => {
  it('is upgraded to the current version; the users keep their data and are not asked to change password', async () => {
    db = await openDatabase(file);

    await expect(db.get('PRAGMA user_version')).resolves.toEqual({ user_version: SCHEMA_VERSION });
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    await expect(userDao.findById(db, 1)).resolves.toEqual({
      id: 1,
      firstName: 'Hannah',
      lastName: 'Hiker',
      email: 'hannah@example.com',
      phone: '+393331111111',
      role: 'hiker',
    });
    for (const id of [1, 2, 3]) {
      expect((await userDao.findById(db, id)).mustChangePassword ?? false, `user ${id}`).toBe(false);
    }
    const credentials = await userDao.findCredentialsByEmail(db, 'hannah@example.com');
    expect(credentials.passwordHash).toBe(passwordHash);
    await expect(verifyPassword('hikerpass', credentials.passwordHash)).resolves.toBe(true);
  });

  it('has an empty table of reset links, one row per token hash, that goes with its user', async () => {
    db = await openDatabase(file);
    await expect(db.all('SELECT * FROM password_resets')).resolves.toEqual([]);

    const link = ['hash-of-a-token', 1, '2026-11-03T09:00:00.000Z'];
    await db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', link);
    await expect(
      db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', link),
    ).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    await expect(
      db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', ['other', 99, link[2]]),
    ).rejects.toThrow(/FOREIGN KEY/);

    await db.run('DELETE FROM users WHERE id = 1');
    await expect(db.all('SELECT * FROM password_resets')).resolves.toEqual([]);
  });

  it('stores the forced change as 0 or 1 only', async () => {
    db = await openDatabase(file);
    await db.run('UPDATE users SET must_change_password = 1 WHERE id = 1');
    await expect(userDao.findById(db, 1)).resolves.toMatchObject({ mustChangePassword: true });
    await expect(db.run('UPDATE users SET must_change_password = 2 WHERE id = 1')).rejects.toThrow(/CHECK/);
  });
});
