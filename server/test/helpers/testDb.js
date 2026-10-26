// Temporary database for tests (planning DoD): every test file gets its own DB file,
// deleted at the end. Tests never touch the development or demo database.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

export function createTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mountain-hut-test-'));
  const file = path.join(dir, 'test.db');
  return {
    dir,
    file,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function useTestDb() {
  const db = createTestDb();
  process.env.DB_PATH = db.file;
  process.env.SESSIONS_DB_PATH = path.join(db.dir, 'sessions.db');
  afterAll(() => db.cleanup());
  return db;
}
