import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteSessionStore } from '../../../src/dao/sessionStore.js';

const { Database } = vi.hoisted(() => ({ Database: vi.fn() }));

vi.mock('sqlite3', () => ({ default: { Database } }));

let store;

afterEach(async () => {
  await store?.close();
  store = null;
});

describe('SQLite session store initialization errors', () => {
  it('rejects readiness when SQLite cannot open the sessions file', async () => {
    const openError = new Error('cannot open database');
    Database.mockImplementation(function (_file, callback) {
      this.serialize = (work) => work();
      this.run = (_sql, _params, done) => done?.(null);
      this.close = (done) => done(null);
      callback(openError);
    });

    store = new SqliteSessionStore('unopenable.db');
    await expect(store.ready).rejects.toBe(openError);
  });

  it('rejects readiness when creating the sessions table fails', async () => {
    const schemaError = new Error('cannot create sessions table');
    Database.mockImplementation(function (_file, callback) {
      this.serialize = (work) => work();
      this.run = (sql, params, callback) => {
        const done = typeof params === 'function' ? params : callback;
        if (sql.startsWith('CREATE TABLE')) done(schemaError);
        else done?.(null);
      };
      this.close = (done) => done(null);
      callback(null);
    });

    store = new SqliteSessionStore('invalid-schema.db');
    await expect(store.ready).rejects.toBe(schemaError);
  });
});
