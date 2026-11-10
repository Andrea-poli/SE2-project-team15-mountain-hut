import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb, openDatabase, SCHEMA_VERSION, sessionsDbPath } from '../../../src/dao/db.js';
import { config } from '../../../src/config.js';
import { withTransaction } from '../../../src/dao/transaction.js';

let db;

beforeEach(async () => {
  await db?.close();
  db = null;
  await closeDb();
  await rm(config.dbPath, { force: true });
  db = await openDatabase(config.dbPath);
});

afterEach(async () => {
  await db?.close();
  db = null;
});

describe('database', () => {
  it('creates the schema, enables foreign keys, and records the schema version', async () => {
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );

    expect(tables).toEqual([
      { name: 'booking_requirements' },
      { name: 'booking_tables' },
      { name: 'bookings' },
      { name: 'slot_tables' },
      { name: 'slots' },
      { name: 'users' },
    ]);
    await expect(db.get('PRAGMA foreign_keys')).resolves.toEqual({ foreign_keys: 1 });
    await expect(db.get('PRAGMA user_version')).resolves.toEqual({ user_version: SCHEMA_VERSION });
  });

  it('persists data after closing and reopening the database', async () => {
    await db.run(
      'INSERT INTO users (email, first_name, role) VALUES (?, ?, ?)',
      ['persistent@example.com', 'Kilian', 'hiker'],
    );
    await db.close();
    db = await openDatabase(config.dbPath);

    await expect(db.get('SELECT first_name FROM users WHERE email = ?', ['persistent@example.com'])).resolves.toEqual({
      first_name: 'Kilian',
    });
  });

  it('supports run, get, all, and exec, and rejects invalid SQL', async () => {
    await db.exec('CREATE TABLE db_test (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO db_test (value) VALUES ("one");');

    const inserted = await db.run('INSERT INTO db_test (value) VALUES (?)', ['two']);
    expect(inserted).toMatchObject({ lastID: expect.any(Number), changes: 1 });
    await expect(db.get('SELECT value FROM db_test WHERE id = ?', [inserted.lastID])).resolves.toEqual({ value: 'two' });
    await expect(db.all('SELECT value FROM db_test ORDER BY id')).resolves.toEqual([
      { value: 'one' },
      { value: 'two' },
    ]);
    await expect(db.exec('THIS IS NOT SQL')).rejects.toBeInstanceOf(Error);
    await expect(db.run('THIS IS NOT SQL')).rejects.toBeInstanceOf(Error);
    await expect(db.get('THIS IS NOT SQL')).rejects.toBeInstanceOf(Error);
    await expect(db.all('THIS IS NOT SQL')).rejects.toBeInstanceOf(Error);
  });

  it('closes a connection and reports a repeated close', async () => {
    await db.close();
    const closedDb = db;
    db = null;

    await expect(closedDb.close()).rejects.toBeInstanceOf(Error);
  });

  it('rejects a database path that points to a directory', async () => {
    const directoryPath = path.join(path.dirname(config.dbPath), 'database-directory');
    await mkdir(directoryPath);

    await expect(openDatabase(directoryPath)).rejects.toBeInstanceOf(Error);
  });

  it('rejects a database with a schema version newer than this server', async () => {
    // Persist the future version, then reopen so the guard runs during migration.
    await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await db.close();
    db = null;

    await expect(openDatabase(config.dbPath)).rejects.toThrow(/this code knows up to/);
  });

  it('reports the setup error even when closing the file after it fails too', async () => {
    await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await db.close();
    db = null;
    const realClose = sqlite3.Database.prototype.close;
    const close = vi.spyOn(sqlite3.Database.prototype, 'close').mockImplementationOnce(function failingClose(done) {
      // Really close the file (the next test deletes it), then report a close error.
      realClose.call(this, () => done(new Error('close failed')));
    });

    await expect(openDatabase(config.dbPath)).rejects.toThrow(/this code knows up to/);
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });

  it('returns the shared connection, clears failed opens, and allows retries after closeDb', async () => {
    // Repeated calls should reuse the same shared connection.
    const first = await getDb();
    expect(await getDb()).toBe(first);
    // Closing an already-closed shared connection should be safe.
    await closeDb();
    await closeDb();
    // Replace the database file with a directory to force the next open to fail, without touching real data.
    await db.close();
    db = null;
    await rm(config.dbPath, { recursive: true, force: true });
    await mkdir(config.dbPath);
    try {
      const opening = getDb();
      const closing = closeDb();
      await expect(opening).rejects.toBeInstanceOf(Error);
      await expect(closing).resolves.toBeUndefined();
    } finally {
      await rm(config.dbPath, { recursive: true, force: true });
    }
    // A failed open must clear the cached promise so a later call can retry.
    const reopened = await getDb();
    expect(await getDb()).toBe(reopened);
    await expect(reopened.get('PRAGMA user_version')).resolves.toEqual({ user_version: SCHEMA_VERSION });
  });

  it('sessionsDbPath creates and returns the sessions database directory path', () => {
    expect(sessionsDbPath()).toBe(config.sessionsDbPath);
  });
});

// U2: a database created by sprint 1 is at version 1 (schema.sql only). Opening it with this code must apply
// the missing migration steps and keep every row. The file is written with sqlite3 directly, without db.js.
describe('schema migrations', () => {
  const versionOnePath = path.join(path.dirname(config.dbPath), 'version-1.db');
  const tablesOfVersionOne = ['users', 'slots', 'slot_tables', 'bookings', 'booking_tables'];
  const sprintOneData = `
    INSERT INTO users (id, email, first_name, role) VALUES (1, 'hannah@example.com', 'Hannah', 'hiker');
    INSERT INTO slots (id, date, start_time, end_time, label) VALUES (1, '2026-11-20', '12:00', '14:00', 'Lunch');
    INSERT INTO slot_tables (id, slot_id, name, seats) VALUES (1, 1, 'T1', 4), (2, 1, 'T2', 6);
    INSERT INTO bookings (id, slot_id, hiker_id, party_size, status, created_at)
      VALUES (1, 1, 1, 3, 'confirmed', '2026-11-09T10:00:00.000Z'), (2, 1, 1, 2, 'cancelled', '2026-11-08T09:00:00.000Z');
    INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (1, 1, 3);`;
  let upgraded;

  /** Runs a SQL script on the file with a plain sqlite3 connection, then closes it. */
  function execOnFile(file, sql) {
    return new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(file, (openErr) => {
        if (openErr) return reject(openErr);
        conn.exec(sql, (execErr) => conn.close((closeErr) => (execErr || closeErr ? reject(execErr || closeErr) : resolve())));
      });
    });
  }

  /** Rows of a query, read with a plain sqlite3 connection (the file is not opened through db.js). */
  function allOnFile(file, sql) {
    return new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (openErr) => {
        if (openErr) return reject(openErr);
        conn.all(sql, (allErr, rows) => conn.close((closeErr) => (allErr || closeErr ? reject(allErr || closeErr) : resolve(rows))));
      });
    });
  }

  /** A version-1 database as sprint 1 left it: schema.sql, user_version 1 and some data. */
  async function createVersionOneDatabase(extraSql = '') {
    const schema = await readFile(new URL('../../../src/dao/schema.sql', import.meta.url), 'utf8');
    await execOnFile(versionOnePath, `${schema} PRAGMA user_version = 1; ${sprintOneData} ${extraSql}`);
  }

  /** Every row of the version-1 tables, through `query(sql)`. */
  async function rowsOfVersionOne(query) {
    const rows = {};
    for (const table of tablesOfVersionOne) rows[table] = await query(`SELECT * FROM ${table} ORDER BY rowid`);
    return rows;
  }

  /** Tables and indexes with their SQL, to compare two databases. */
  const schemaOf = (query) =>
    query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

  beforeEach(async () => {
    await rm(versionOnePath, { force: true });
  });

  afterEach(async () => {
    await upgraded?.close();
    upgraded = null;
    await rm(versionOnePath, { force: true });
  });

  it('upgrades a version-1 database to the current version without losing data', async () => {
    await createVersionOneDatabase();
    const before = await rowsOfVersionOne((sql) => allOnFile(versionOnePath, sql));

    upgraded = await openDatabase(versionOnePath);

    expect(SCHEMA_VERSION).toBe(2);
    await expect(upgraded.get('PRAGMA user_version')).resolves.toEqual({ user_version: SCHEMA_VERSION });
    await expect(rowsOfVersionOne((sql) => upgraded.all(sql))).resolves.toEqual(before);
    expect(before.bookings).toHaveLength(2);
    await expect(upgraded.all('SELECT * FROM booking_requirements')).resolves.toEqual([]);
  });

  it('gives an upgraded database the same tables and indexes as a new one', async () => {
    await createVersionOneDatabase();
    upgraded = await openDatabase(versionOnePath);

    const newSchema = await schemaOf((sql) => db.all(sql));
    expect(newSchema).toContainEqual(expect.objectContaining({ type: 'index', name: 'booking_requirements_by_booking' }));
    await expect(schemaOf((sql) => upgraded.all(sql))).resolves.toEqual(newSchema);
  });

  it('applies a step only once: an upgraded database reopens as it is, with its requirements', async () => {
    await createVersionOneDatabase();
    upgraded = await openDatabase(versionOnePath);
    await upgraded.run('INSERT INTO booking_requirements (booking_id, has_allergies, description) VALUES (1, 1, ?)', [
      '1 shellfish allergy',
    ]);
    await upgraded.close();

    upgraded = await openDatabase(versionOnePath);

    await expect(upgraded.get('PRAGMA user_version')).resolves.toEqual({ user_version: SCHEMA_VERSION });
    await expect(upgraded.all('SELECT booking_id, has_allergies, description FROM booking_requirements')).resolves.toEqual([
      { booking_id: 1, has_allergies: 1, description: '1 shellfish allergy' },
    ]);
  });

  it('leaves a version-1 database as it was when a migration step fails', async () => {
    // A table with the same name makes CREATE TABLE booking_requirements fail inside the migration transaction.
    await createVersionOneDatabase('CREATE TABLE booking_requirements (id INTEGER PRIMARY KEY);');
    const before = await rowsOfVersionOne((sql) => allOnFile(versionOnePath, sql));

    await expect(openDatabase(versionOnePath)).rejects.toThrow(/booking_requirements already exists/);

    await expect(allOnFile(versionOnePath, 'PRAGMA user_version')).resolves.toEqual([{ user_version: 1 }]);
    await expect(rowsOfVersionOne((sql) => allOnFile(versionOnePath, sql))).resolves.toEqual(before);
    await expect(allOnFile(versionOnePath, "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'booking_requirements%'"))
      .resolves.toEqual([]);
  });
});

describe('database schema constraints', () => {
  it('requires a valid user role and unique case-insensitive email', async () => {
    await db.run('INSERT INTO users (email, first_name, role) VALUES (?, ?, ?)', [
      'kilian@example.com',
      'Kilian',
      'hiker',
    ]);

    await expect(
      db.run('INSERT INTO users (email, first_name, role) VALUES (?, ?, ?)', ['other@example.com', 'Grace', 'guest']),
    ).rejects.toThrow();
    await expect(
      db.run('INSERT INTO users (email, first_name, role) VALUES (?, ?, ?)', ['KILIAN@example.com', 'Another Kilian', 'hiker']),
    ).rejects.toThrow();
  });

  it('rejects invalid slot dates, times, labels, statuses, and ranges', async () => {
    const insertSlot = (date, startTime, endTime, label, status = 'open') =>
      db.run(
        'INSERT INTO slots (date, start_time, end_time, label, status) VALUES (?, ?, ?, ?, ?)',
        [date, startTime, endTime, label, status],
      );

    await expect(insertSlot('2026-02-30', '12:00', '13:00', 'Lunch')).rejects.toThrow();
    await expect(insertSlot('2026-13-25', '12:00', '13:00', 'Lunch')).rejects.toThrow();
    await expect(insertSlot('2026-11-02', '29:99', '30:00', 'Lunch')).rejects.toThrow();
    await expect(insertSlot('2026-11-02', '23:00', '24:30', 'Lunch')).rejects.toThrow();
    await expect(insertSlot('2026-11-02', '12:00', '12:00', 'Lunch')).rejects.toThrow();
    await expect(insertSlot('2026-11-02', '12:00', '13:00', '   ')).rejects.toThrow();
    await expect(insertSlot('2026-11-02', '12:00', '13:00', 'Lunch', 'unknown')).rejects.toThrow();
  });

  it('enforces table, booking, and foreign-key constraints', async () => {
    await expect(db.run('INSERT INTO slot_tables (slot_id, name, seats) VALUES (999, ?, ?)', ['A', 4])).rejects.toThrow();

    const { lastID: userId } = await db.run(
      'INSERT INTO users (first_name, role) VALUES (?, ?)',
      ['Kilian', 'hiker'],
    );
    const { lastID: slotId } = await db.run(
      'INSERT INTO slots (date, start_time, end_time, label) VALUES (?, ?, ?, ?)',
      ['2026-11-02', '12:00', '13:00', 'Lunch'],
    );
    const { lastID: tableId } = await db.run(
      'INSERT INTO slot_tables (slot_id, name, seats) VALUES (?, ?, ?)',
      [slotId, 'A', 4],
    );
    const { lastID: bookingId } = await db.run(
      'INSERT INTO bookings (slot_id, hiker_id, party_size, created_at) VALUES (?, ?, ?, ?)',
      [slotId, userId, 2, '2026-11-01T10:00:00.000Z'],
    );

    await expect(db.run('INSERT INTO slot_tables (slot_id, name, seats) VALUES (?, ?, ?)', [slotId, 'B', 0]))
      .rejects.toThrow();
    await expect(
      db.run('INSERT INTO bookings (slot_id, hiker_id, party_size, created_at) VALUES (?, ?, ?, ?)', [
        slotId,
        userId,
        0,
        '2026-11-01T10:00:00.000Z',
      ]),
    ).rejects.toThrow();
    await expect(
      db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [bookingId, tableId, 0]),
    ).rejects.toThrow();
    await expect(
      db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [bookingId, 999, 1]),
    ).rejects.toThrow();
    await expect(db.run('DELETE FROM slots WHERE id = ?', [slotId])).rejects.toThrow();
  });

  it('allows cancelled bookings to be rebooked but prevents duplicate confirmed bookings', async () => {
    const { lastID: userId } = await db.run(
      'INSERT INTO users (first_name, role) VALUES (?, ?)',
      ['Kilian', 'hiker'],
    );
    const { lastID: slotId } = await db.run(
      'INSERT INTO slots (date, start_time, end_time, label) VALUES (?, ?, ?, ?)',
      ['2026-11-02', '12:00', '13:00', 'Lunch'],
    );
    const bookingValues = [slotId, userId, 2, '2026-11-01T10:00:00.000Z'];
    await db.run(
      "INSERT INTO bookings (slot_id, hiker_id, party_size, status, created_at) VALUES (?, ?, ?, 'cancelled', ?)",
      bookingValues,
    );
    await db.run(
      "INSERT INTO bookings (slot_id, hiker_id, party_size, status, created_at) VALUES (?, ?, ?, 'confirmed', ?)",
      bookingValues,
    );

    await expect(
      db.run(
        "INSERT INTO bookings (slot_id, hiker_id, party_size, status, created_at) VALUES (?, ?, ?, 'confirmed', ?)",
        bookingValues,
      ),
    ).rejects.toThrow();
  });

  it('checks booking requirements and deletes them with their booking', async () => {
    const { lastID: userId } = await db.run('INSERT INTO users (first_name, role) VALUES (?, ?)', ['Kilian', 'hiker']);
    const { lastID: slotId } = await db.run(
      'INSERT INTO slots (date, start_time, end_time, label) VALUES (?, ?, ?, ?)',
      ['2026-11-02', '12:00', '13:00', 'Lunch'],
    );
    const { lastID: bookingId } = await db.run(
      'INSERT INTO bookings (slot_id, hiker_id, party_size, created_at) VALUES (?, ?, ?, ?)',
      [slotId, userId, 3, '2026-11-01T10:00:00.000Z'],
    );
    const insertRequirement = (id, hasAllergies, description) =>
      db.run('INSERT INTO booking_requirements (booking_id, has_allergies, description) VALUES (?, ?, ?)', [
        id,
        hasAllergies,
        description,
      ]);

    await insertRequirement(bookingId, 1, '1 vegan, peanut allergy');
    await insertRequirement(bookingId, 0, '2 vegetarians');
    await expect(insertRequirement(bookingId, 2, 'flag not 0 or 1')).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertRequirement(bookingId, null, 'missing flag')).rejects.toThrow(/NOT NULL constraint failed/);
    await expect(insertRequirement(bookingId, 0, '')).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertRequirement(bookingId, 0, '   ')).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertRequirement(bookingId, 0, null)).rejects.toThrow(/NOT NULL constraint failed/);
    await expect(insertRequirement(999, 0, 'unknown booking')).rejects.toThrow(/FOREIGN KEY constraint failed/);

    await db.run('DELETE FROM bookings WHERE id = ?', [bookingId]);
    await expect(db.get('SELECT COUNT(*) AS count FROM booking_requirements')).resolves.toEqual({ count: 0 });
  });
});

describe('transactions', () => {
  it('queues concurrent transactions on the same connection', async () => {
    let releaseFirst;
    let markFirstStarted;
    const firstStarted = new Promise((resolve) => {
      markFirstStarted = resolve;
    });
    const firstCanFinish = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const order = [];

    const first = withTransaction(db, async (transactionDb) => {
      order.push('first started');
      await transactionDb.run(
        'INSERT INTO users (first_name, role) VALUES (?, ?)',
        ['First', 'hiker'],
      );
      markFirstStarted();
      await firstCanFinish;
      order.push('first finished');
    });
    await firstStarted;

    const second = withTransaction(db, async (transactionDb) => {
      order.push('second started');
      await transactionDb.run(
        'INSERT INTO users (first_name, role) VALUES (?, ?)',
        ['Second', 'hiker'],
      );
    });
    expect(order).toEqual(['first started']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first started', 'first finished', 'second started']);
    await expect(db.all('SELECT first_name FROM users ORDER BY id')).resolves.toEqual([
      { first_name: 'First' },
      { first_name: 'Second' },
    ]);
  });

  it('rolls back failed work and allows the next transaction to commit', async () => {
    const failure = new Error('transaction work failed');

    await expect(
      withTransaction(db, async (transactionDb) => {
        await transactionDb.run(
          'INSERT INTO users (first_name, role) VALUES (?, ?)',
          ['Rolled back', 'hiker'],
        );
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(db.get('SELECT COUNT(*) AS count FROM users')).resolves.toEqual({ count: 0 });

    await expect(
      withTransaction(db, async (transactionDb) => {
        await transactionDb.run(
          'INSERT INTO users (first_name, role) VALUES (?, ?)',
          ['Committed', 'hiker'],
        );
        return 'committed';
      }),
    ).resolves.toBe('committed');
    await expect(db.get('SELECT first_name FROM users')).resolves.toEqual({ first_name: 'Committed' });
  });

  it('recovers after BEGIN fails so the next transaction can run', async () => {
    const beginError = new Error('begin failed');
    let failBegin = true;
    const transactionDb = {
      run: vi.fn(async (sql) => {
        if (sql === 'BEGIN IMMEDIATE' && failBegin) {
          failBegin = false;
          throw beginError;
        }
        return {};
      }),
    };
    const work = vi.fn(async () => 'committed');

    await expect(withTransaction(transactionDb, work)).rejects.toBe(beginError);
    await expect(withTransaction(transactionDb, work)).resolves.toBe('committed');

    expect(work).toHaveBeenCalledTimes(1);
    expect(transactionDb.run.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN IMMEDIATE',
      'BEGIN IMMEDIATE',
      'COMMIT',
    ]);
  });

  it('rolls back after COMMIT fails and allows the next transaction to run', async () => {
    const commitError = new Error('commit failed');
    let failCommit = true;
    const transactionDb = {
      run: vi.fn(async (sql) => {
        if (sql === 'COMMIT' && failCommit) {
          failCommit = false;
          throw commitError;
        }
        return {};
      }),
    };
    const work = vi.fn(async () => 'committed');

    await expect(withTransaction(transactionDb, work)).rejects.toBe(commitError);
    await expect(withTransaction(transactionDb, work)).resolves.toBe('committed');

    expect(work).toHaveBeenCalledTimes(2);
    expect(transactionDb.run.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN IMMEDIATE',
      'COMMIT',
      'ROLLBACK',
      'BEGIN IMMEDIATE',
      'COMMIT',
    ]);
  });

  it('rethrows the work error when rollback itself fails', async () => {
    const workError = new Error('work failed');
    const rollbackError = new Error('rollback failed');
    // A real SQLite connection cannot reliably produce this double failure on demand.
    const transactionDb = {
      run: vi.fn(async (sql) => {
        if (sql === 'ROLLBACK') throw rollbackError;
        return {};
      }),
    };

    await expect(
      withTransaction(transactionDb, async () => {
        throw workError;
      }),
    ).rejects.toBe(workError);
    expect(transactionDb.run.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
  });
});
