// MH-05 BT1 – migration seen from the bookings: a database left by sprint 1 (schema version 1) is upgraded to
// version 2 when the server opens it, and its bookings are still read as before, now with an empty list of
// party requirements; new bookings on it can have requirements. (The table-by-table checks are in db.test.js.)
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../../src/config.js';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import { openDatabase, SCHEMA_VERSION } from '../../../src/dao/db.js';

const file = path.join(path.dirname(config.dbPath), 'sprint-1-bookings.db');

// What sprint 1 can leave: a hiker, a slot with two tables, a confirmed and a cancelled booking.
const SPRINT_ONE_DATA = `
  INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (1, 'hannah@example.com', 'Hannah', 'Hiker', 'hiker');
  INSERT INTO slots (id, date, start_time, end_time, label) VALUES (1, '2026-11-20', '19:00', '20:30', 'Dinner');
  INSERT INTO slot_tables (id, slot_id, name, seats) VALUES (1, 1, 'T1', 4), (2, 1, 'T2', 6);
  INSERT INTO bookings (id, slot_id, hiker_id, party_size, status, created_at)
    VALUES (1, 1, 1, 7, 'confirmed', '2026-11-09T10:00:00.000Z'),
           (2, 1, 1, 2, 'cancelled', '2026-11-08T09:00:00.000Z');
  INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (1, 1, 3), (1, 2, 4);`;

/** Writes a version-1 database with a plain sqlite3 connection (not through db.js). */
async function writeVersionOne() {
  const schema = await readFile(new URL('../../../src/dao/schema.sql', import.meta.url), 'utf8');
  await new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(file, (openErr) => {
      if (openErr) return reject(openErr);
      conn.exec(`${schema} PRAGMA user_version = 1; ${SPRINT_ONE_DATA}`, (err) =>
        conn.close((closeErr) => (err || closeErr ? reject(err || closeErr) : resolve())),
      );
    });
  });
}

let db;

beforeEach(async () => {
  await rm(file, { force: true });
  await writeVersionOne();
});

afterEach(async () => {
  await db?.close();
  db = null;
  await rm(file, { force: true });
});

describe('a sprint 1 database opened by this server', () => {
  it('is upgraded to version 2, and its bookings read as before with no requirements', async () => {
    db = await openDatabase(file);

    expect(SCHEMA_VERSION).toBe(2);
    await expect(db.get('PRAGMA user_version')).resolves.toEqual({ user_version: 2 });
    await expect(bookingDao.findById(db, 1)).resolves.toEqual({
      id: 1,
      hikerId: 1,
      slot: { id: 1, date: '2026-11-20', startTime: '19:00', endTime: '20:30', label: 'Dinner' },
      partySize: 7,
      tables: [
        { slotTableId: 1, tableName: 'T1', seats: 3 },
        { slotTableId: 2, tableName: 'T2', seats: 4 },
      ],
      requirements: [],
      status: 'confirmed',
      createdAt: '2026-11-09T10:00:00.000Z',
    });
    await expect(bookingDao.findById(db, 2)).resolves.toMatchObject({ status: 'cancelled', requirements: [] });
    await expect(bookingDao.allocationsForSlot(db, 1)).resolves.toEqual(
      expect.arrayContaining([
        { slotTableId: 1, seats: 3 },
        { slotTableId: 2, seats: 4 },
      ]),
    );
  });

  it('accepts new bookings with requirements next to the old ones', async () => {
    db = await openDatabase(file);
    await db.run(
      "INSERT INTO users (id, email, first_name, last_name, role) VALUES (2, 'anna@example.com', 'Anna', 'B', 'hiker')",
    );

    const created = await bookingDao.create(db, {
      slotId: 1,
      hikerId: 2,
      partySize: 2,
      createdAt: '2026-11-10T10:00:00.000Z',
      tables: [{ slotTableId: 1, seats: 1 }, { slotTableId: 2, seats: 1 }],
      requirements: [{ hasAllergies: true, description: '1 peanut allergy' }],
    });

    expect(created.requirements).toEqual([{ hasAllergies: true, description: '1 peanut allergy' }]);
    await expect(bookingDao.findById(db, 1)).resolves.toMatchObject({ requirements: [] });
  });
});
