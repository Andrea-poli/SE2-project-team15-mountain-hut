// Starts the server. config.js is imported first: it sets TZ and checks the settings before anything else runs.
import { rmSync } from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { closeDb, getDb } from './dao/db.js';
import { closeSessionStore } from './session.js';

// E2E (Playwright starts the server with NODE_ENV=e2e): every run starts from an empty database.
// Only in e2e, so the development database is never touched; before createApp(), which will open sessions.db (U5).
if (config.env === 'e2e') {
  rmSync(config.dbPath, { force: true });
  rmSync(config.sessionsDbPath, { force: true });
}

// Opens the database (and creates or migrates its tables) before accepting requests:
// a wrong DB_PATH or a broken schema stops the server here, with the SQLite error.
await getDb();

const app = createApp();

// Express 5 passes listen errors (e.g. port already in use) to the callback: without this check
// the server would print "Mountain Hut API on …" and then stop without saying why.
const server = app.listen(config.port, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      err.message = `Port ${config.port} is already in use: stop the other server or set another PORT in .env (${err.message})`;
    }
    throw err;
  }
  console.log(`Mountain Hut API on http://localhost:${config.port} (${config.env}, TZ=${process.env.TZ})`);
  if (config.fakeNow) {
    console.warn(
      [
        '',
        '  ⚠  FAKE_NOW is active: the server lives on a fixed day and time,',
        `     ${process.env.FAKE_NOW} (hut local time). Remove it from .env for real use.`,
        '',
      ].join('\n'),
    );
  }
});

// Ctrl+C (SIGINT) or a stop from the system (SIGTERM): stop accepting requests, let the ones in progress
// finish, close the databases (main and sessions), then exit. A second Ctrl+C exits at once (once, not on).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await closeSessionStore();
      await closeDb();
      process.exit(0);
    });
  });
}
