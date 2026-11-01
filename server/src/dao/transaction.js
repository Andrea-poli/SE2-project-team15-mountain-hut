// Transaction helper (planning 4.2). The whole server shares one SQLite connection (db.js),
// and SQLite cannot open a second transaction on a connection that already has one:
// transactions are queued per connection and run one at a time, in arrival order.
//
// Rules for the services:
// - every write goes through withTransaction (e.g. a booking: re-read the seats, then save);
// - never call withTransaction inside another one: it would wait for itself forever.

const queues = new WeakMap(); // connection -> promise of its last transaction

/**
 * Runs work(db) inside BEGIN IMMEDIATE … COMMIT, after the transactions already queued on db.
 * If work throws, the transaction is rolled back and the same error is thrown to the caller.
 * BEGIN IMMEDIATE takes the write lock at the start, so what work reads cannot change before it writes
 * (two bookings of the last seats: the second one sees the first one and gets 409).
 * @template T
 * @param {object} db connection from db.js
 * @param {(db: object) => Promise<T>} work
 * @returns {Promise<T>} what work returns
 */
export function withTransaction(db, work) {
  const previous = queues.get(db) ?? Promise.resolve();
  const current = previous
    .catch(() => {}) // a failed transaction must not block the next ones
    .then(async () => {
      await db.run('BEGIN IMMEDIATE');
      try {
        const result = await work(db);
        await db.run('COMMIT');
        return result;
      } catch (err) {
        // SQLite may have already rolled back by itself (e.g. disk full): report the original error.
        await db.run('ROLLBACK').catch(() => {});
        throw err;
      }
    });
  queues.set(db, current);
  return current;
}
