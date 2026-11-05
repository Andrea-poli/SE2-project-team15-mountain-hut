import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';
import { createTestDb } from '../helpers/testDb.js';

describe('temporary test database', () => {
  it('the server uses the temporary test DB, not the dev one', () => {
    expect(config.dbPath).toContain('mountain-hut-test-');
    expect(config.dbPath).not.toContain(path.join('server', 'data'));
    expect(config.sessionsDbPath).toContain('mountain-hut-test-');
    expect(path.dirname(config.sessionsDbPath)).toBe(path.dirname(config.dbPath));
  });

  it('gives every test file its own folder, removed by cleanup', () => {
    const a = createTestDb();
    const b = createTestDb();
    expect(a.file).not.toBe(b.file);
    expect(path.basename(a.file)).toBe('test.db');

    writeFileSync(a.file, '');
    a.cleanup();
    b.cleanup();
    expect(existsSync(a.dir)).toBe(false);
    expect(existsSync(b.dir)).toBe(false);
  });
});
