import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
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
