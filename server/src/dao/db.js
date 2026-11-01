// SQLite connection (planning 4.2): foreign keys on, busy timeout, schema and minimal migrations.
// The server uses one shared connection, getDb(); tests and the seed can open their own with openDatabase().
// Paths come from config.js (DATA_DIR, DB_PATH, SESSIONS_DB_PATH): tests get a temporary DB automatically.
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { config } from '../config.js';
import { withTransaction } from './transaction.js';

const schemaUrl = new URL('./schema.sql', import.meta.url);

// Schema changes after schema.sql (version 1): append one SQL step here; never edit schema.sql or an old step,
// databases already in use would not get the change. Step i brings a database from version i + 1 to i + 2.
// A new database gets schema.sql and then every step, so it ends with the same tables as an old one.
// Example (MH-05): 'ALTER TABLE bookings ADD COLUMN requirements TEXT',
const MIGRATIONS = [];

export const SCHEMA_VERSION = 1 + MIGRATIONS.length;

// Waits up to 5 s for a write lock held by another connection (e.g. the seed script) instead of failing at once.
const BUSY_TIMEOUT_MS = 5000;

/**
 * Opens a connection to the SQLite file at dbPath (its folder is created if needed) and brings
 * the schema up to date. Every method returns a Promise:
 * - run(sql, params) → { lastID, changes }
 * - get(sql, params) → first row or undefined
 * - all(sql, params) → array of rows
 * - exec(sql)        → runs a script of several statements
 * - close()
 * @param {string} dbPath
 */
export async function openDatabase(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const connection = await new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(conn)));
  });
  const db = wrap(connection);

  // If the setup fails, close the file before reporting the error (Windows cannot delete an open file).
  try {
    // Per connection, off by default in SQLite: without it the REFERENCES of schema.sql are not checked.
    await db.run('PRAGMA foreign_keys = ON');
    await db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await migrate(db);
  } catch (err) {
    await db.close().catch(() => {}); // report the setup error, not a close error
    throw err;
  }
  return db;
}

/**
 * Creates the tables of a new database, or applies the missing migration steps to an older one.
 * The version is stored in the database file (PRAGMA user_version); does nothing when it is up to date.
 */
async function migrate(db) {
  const schema = await readFile(schemaUrl, 'utf8');
  await withTransaction(db, async () => {
    // Read inside the transaction: another connection may have migrated the file in the meantime.
    const { user_version: version } = await db.get('PRAGMA user_version');
    if (version > SCHEMA_VERSION) {
      throw new Error(
        `The database is at schema version ${version}, this code knows up to ${SCHEMA_VERSION}: update the code.`,
      );
    }
    if (version === SCHEMA_VERSION) return;
    if (version === 0) await db.exec(schema);
    for (const step of MIGRATIONS.slice(Math.max(version - 1, 0))) await db.exec(step);
    await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

// Adapts the sqlite3 callbacks to Promises.
function wrap(connection) {
  return {
    run: (sql, params = []) =>
      new Promise((resolve, reject) => {
        // sqlite3 puts lastID and changes on `this`: a classic function is needed.
        connection.run(sql, params, function onDone(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }),
    get: (sql, params = []) =>
      new Promise((resolve, reject) => {
        connection.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
      }),
    all: (sql, params = []) =>
      new Promise((resolve, reject) => {
        connection.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      }),
    exec: (sql) =>
      new Promise((resolve, reject) => {
        connection.exec(sql, (err) => (err ? reject(err) : resolve()));
      }),
    close: () =>
      new Promise((resolve, reject) => {
        connection.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

let shared = null; // Promise of the shared connection, opened at the first getDb()

/** The connection used by the services: opened once on config.dbPath, then reused. */
export function getDb() {
  shared ??= openDatabase(config.dbPath).catch((err) => {
    shared = null; // let the next call try again
    throw err;
  });
  return shared;
}

/** Closes the shared connection (end of the tests, server shutdown). Does nothing when it is not open. */
export async function closeDb() {
  if (!shared) return;
  const opening = shared;
  shared = null;
  const db = await opening.catch(() => null);
  await db?.close();
}

/**
 * Path of sessions.db for the session store of U5, its folder already created.
 * Sessions live in their own file, so a login never waits for a booking transaction.
 */
export function sessionsDbPath() {
  mkdirSync(path.dirname(config.sessionsDbPath), { recursive: true });
  return config.sessionsDbPath;
}
