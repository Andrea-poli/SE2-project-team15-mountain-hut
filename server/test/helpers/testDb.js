// Temporary database for tests. Used by test/setupTestDb.js, which sets DB_PATH and SESSIONS_DB_PATH
// before every test file: tests do not need to call anything, config.dbPath is already the temp DB.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function createTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mountain-hut-test-'));
  return {
    dir,
    file: path.join(dir, 'test.db'),
    sessionsFile: path.join(dir, 'sessions.db'),
    // Windows cannot delete a file that is still open (EBUSY): retry for a moment.
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}
