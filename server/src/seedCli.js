// `npm run seed`: fills the development database with the demo data of seed.js (U10).
// Only the launch lives here (production check, logout, message, closing), so seed.js can be imported
// by a test without side effects. Like index.js, it is a start point: no unit tests, no coverage.
import { existsSync } from 'node:fs';
import sqlite3 from 'sqlite3';
import { now } from './clock.js';
import { config } from './config.js';
import { closeDb, getDb } from './dao/db.js';
import { seed } from './seed.js';

/**
 * Logs everybody out: after the seed the user ids start again from 1, so an old session could
 * point to another user. Does nothing when sessions.db does not exist yet (server never started).
 */
function deleteSessions(file) {
  if (!existsSync(file)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sessions = new sqlite3.Database(file, (err) => err && reject(err));
    sessions.serialize(() => {
      sessions.run('PRAGMA busy_timeout = 5000');
      sessions.run('DELETE FROM sessions', (err) => {
        sessions.close();
        // No table yet: nobody has ever logged in.
        if (err && !/no such table/.test(err.message)) reject(err);
        else resolve();
      });
    });
  });
}

if (config.env === 'production') {
  console.error('The seed deletes every user, slot and booking: it never runs when NODE_ENV is production.');
  process.exit(1);
}

try {
  const summary = await seed(await getDb(), now());
  await deleteSessions(config.sessionsDbPath);
  console.log(
    `Demo data ready in ${config.dbPath}: ${summary.users} users, ${summary.slots} slots ` +
      `(${summary.from} → ${summary.to}), ${summary.bookings} bookings. Everybody has been logged out.`,
  );
} catch (err) {
  console.error('Seed failed, the database is unchanged:', err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
