// Vitest setup file (server/vitest.config.js): it runs before the imports of every test file,
// so config.js always reads the temporary paths. Every test file gets its own DB, deleted at the end.
// Tests never touch the development or demo database (planning DoD).
import { afterAll } from 'vitest';
import { createTestDb } from './helpers/testDb.js';

const db = createTestDb();
process.env.DB_PATH = db.file;
process.env.SESSIONS_DB_PATH = db.sessionsFile;
afterAll(async () => {
  // Close the shared connections first (main DB and sessions.db): Windows cannot delete an open file.
  // Imported here, not at the top, so config.js is never loaded before DB_PATH is set;
  // a file that never used the DB or createApp() just opens nothing.
  const { closeSessionStore } = await import('../src/session.js');
  await closeSessionStore();
  const { closeDb } = await import('../src/dao/db.js');
  await closeDb();
  db.cleanup();
});
