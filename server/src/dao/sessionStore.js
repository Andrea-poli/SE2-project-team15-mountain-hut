// express-session store in its own SQLite file (config.sessionsDbPath): a login never waits
// for a booking transaction of the main database, and sessions survive a server restart.
// Table: sessions(sid, sess JSON, expires ms since epoch). Expired rows are ignored and cleaned up.
// Session expiry uses the real clock, not now() of clock.js: express-session sets the cookie expiry
// with the real time, and FAKE_NOW (E2E, demos) must not make every session expired or eternal.
/* eslint-disable no-restricted-syntax -- real time on purpose, see above */
import session from 'express-session';
import sqlite3 from 'sqlite3';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 15 * 60 * 1000;

export class SqliteSessionStore extends session.Store {
  /** @param {string} file path of sessions.db (its folder must exist: sessionsDbPath() in db.js) */
  constructor(file) {
    super();
    this.db = new sqlite3.Database(file);
    this.ready = new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('PRAGMA busy_timeout = 5000');
        this.db.run(
          'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL)',
          (err) => (err ? reject(err) : resolve()),
        );
      });
    });
    this.cleanup = setInterval(() => this.#deleteExpired(), CLEANUP_EVERY_MS);
    this.cleanup.unref(); // never keeps the process alive
  }

  // Session expiry: the cookie's, or one day for cookies without an expiry.
  static #expires(sess) {
    const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isNaN(expires) ? Date.now() + ONE_DAY_MS : expires;
  }

  // Run a statement once the table exists; errors go to the express-session callback.
  #run(method, sql, params, callback) {
    this.ready.then(
      () => this.db[method](sql, params, callback),
      (err) => callback(err),
    );
  }

  get(sid, callback) {
    this.#run('get', 'SELECT sess FROM sessions WHERE sid = ? AND expires > ?', [sid, Date.now()], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);
      try {
        return callback(null, JSON.parse(row.sess));
      } catch (parseError) {
        return callback(parseError);
      }
    });
  }

  set(sid, sess, callback = () => {}) {
    this.#run(
      'run',
      'INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT (sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires',
      [sid, JSON.stringify(sess), SqliteSessionStore.#expires(sess)],
      (err) => callback(err ?? null),
    );
  }

  destroy(sid, callback = () => {}) {
    this.#run('run', 'DELETE FROM sessions WHERE sid = ?', [sid], (err) => callback(err ?? null));
  }

  touch(sid, sess, callback = () => {}) {
    this.#run(
      'run',
      'UPDATE sessions SET expires = ? WHERE sid = ?',
      [SqliteSessionStore.#expires(sess), sid],
      (err) => callback(err ?? null),
    );
  }

  #deleteExpired() {
    this.#run('run', 'DELETE FROM sessions WHERE expires <= ?', [Date.now()], () => {});
  }

  /** Stops the cleanup timer and closes the file (tests, server shutdown). */
  close() {
    clearInterval(this.cleanup);
    return new Promise((resolve, reject) => this.db.close((err) => (err ? reject(err) : resolve())));
  }
}
