import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config.js';
import { SqliteSessionStore } from '../../../src/dao/sessionStore.js';

let store;
let intervalSpy;

function callStore(method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function runSql(sql, params = [], targetStore = store) {
  return new Promise((resolve, reject) => {
    targetStore.db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function getSql(sql, params = [], targetStore = store) {
  return new Promise((resolve, reject) => {
    targetStore.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

beforeEach(async () => {
  intervalSpy = vi.spyOn(globalThis, 'setInterval');
  store = new SqliteSessionStore(config.sessionsDbPath);
  await store.ready;
  await runSql('DELETE FROM sessions');
});

afterEach(async () => {
  try {
    await store?.close();
  } finally {
    store = null;
    intervalSpy?.mockRestore();
    intervalSpy = null;
  }
});

describe('SQLite session store', () => {
  it('stores, reads, updates, and destroys a session', async () => {
    const original = { userId: 7, cookie: { expires: '2030-01-01T00:00:00.000Z' } };
    await callStore('set', 'session-id', original);
    await expect(callStore('get', 'session-id')).resolves.toEqual(original);

    const updated = { userId: 8, cookie: { expires: '2030-01-02T00:00:00.000Z' } };
    await callStore('set', 'session-id', updated);
    await expect(callStore('get', 'session-id')).resolves.toEqual(updated);

    await callStore('destroy', 'session-id');
    await expect(callStore('get', 'session-id')).resolves.toBeNull();
  });

  it('reads a saved session after reopening the SQLite store', async () => {
    const savedSession = { userId: 42, cookie: { expires: '2030-01-01T00:00:00.000Z' } };
    await callStore('set', 'persistent-session', savedSession);
    await store.close();

    store = new SqliteSessionStore(config.sessionsDbPath);
    await store.ready;

    await expect(callStore('get', 'persistent-session')).resolves.toEqual(savedSession);
  });

  it('supports omitted callbacks for set, touch, and destroy', async () => {
    await store.set('callback-free', { userId: 3 });
    await expect(callStore('get', 'callback-free')).resolves.toMatchObject({ userId: 3 });

    await store.touch('callback-free', { cookie: { expires: '2030-01-01T00:00:00.000Z' } });
    const row = await getSql('SELECT expires FROM sessions WHERE sid = ?', ['callback-free']);
    expect(row.expires).toBe(new Date('2030-01-01T00:00:00.000Z').getTime());

    await store.destroy('callback-free');
    await expect(callStore('get', 'callback-free')).resolves.toBeNull();
  });

  it('uses a one-day expiry for sessions without a cookie expiration', async () => {
    const startedAt = Date.now();
    await callStore('set', 'session-without-expiry', { userId: 3 });
    const { expires } = await getSql('SELECT expires FROM sessions WHERE sid = ?', ['session-without-expiry']);

    expect(expires).toBeGreaterThanOrEqual(startedAt + 24 * 60 * 60 * 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  });

  it('touches the expiry and ignores expired rows when reading', async () => {
    await callStore('set', 'expiring-session', {
      userId: 4,
      cookie: { expires: '2030-01-01T00:00:00.000Z' },
    });

    const refreshedExpiry = Date.now() + 60_000;
    await callStore('touch', 'expiring-session', {
      cookie: { expires: new Date(refreshedExpiry).toISOString() },
    });
    const { expires } = await getSql('SELECT expires FROM sessions WHERE sid = ?', ['expiring-session']);
    expect(expires).toBe(refreshedExpiry);

    await runSql('UPDATE sessions SET expires = ? WHERE sid = ?', [Date.now() - 1, 'expiring-session']);
    await expect(callStore('get', 'expiring-session')).resolves.toBeNull();
  });

  it('reports malformed stored JSON as a read error', async () => {
    await runSql('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)', [
      'malformed-session',
      '{invalid json',
      Date.now() + 60_000,
    ]);

    await expect(callStore('get', 'malformed-session')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('forwards SQLite read and write errors to the session callbacks', async () => {
    const databaseError = new Error('simulated SQLite failure');
    const originalGet = store.db.get;
    const originalRun = store.db.run;
    store.db.get = (_sql, _params, callback) => callback(databaseError);
    store.db.run = (_sql, _params, callback) => callback(databaseError);

    try {
      await expect(callStore('get', 'broken')).rejects.toBe(databaseError);
      await expect(callStore('set', 'broken', {})).rejects.toBe(databaseError);
      await expect(callStore('touch', 'broken', {})).rejects.toBe(databaseError);
      await expect(callStore('destroy', 'broken')).rejects.toBe(databaseError);
    } finally {
      store.db.get = originalGet;
      store.db.run = originalRun;
    }
  });

  it('forwards a store initialization rejection to pending operations', async () => {
    const initializationError = new Error('session database failed to initialize');
    store.ready = Promise.reject(initializationError);

    await expect(callStore('get', 'session-id')).rejects.toBe(initializationError);
  });

  it('deletes expired rows when the periodic cleanup runs', async () => {
    await runSql(
      'INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)',
      ['expired-session', '{}', Date.now() - 1],
    );

    const cleanup = intervalSpy.mock.calls.at(-1)[0];
    const originalRun = store.db.run;
    const cleanupFinished = new Promise((resolve, reject) => {
      store.db.run = (sql, params, callback) => {
        if (!sql.startsWith('DELETE FROM sessions WHERE expires <=')) {
          return originalRun.call(store.db, sql, params, callback);
        }
        return originalRun.call(store.db, sql, params, (err) => {
          callback(err);
          if (err) reject(err);
          else resolve();
        });
      };
    });
    cleanup();
    await cleanupFinished;
    const { count } = await getSql(
      'SELECT COUNT(*) AS count FROM sessions WHERE sid = ?',
      ['expired-session'],
    );
    expect(count).toBe(0);
    store.db.run = originalRun;
  });

  it('rejects when closing the SQLite session database fails', async () => {
    const originalClose = store.db.close;
    store.db.close = (callback) => callback(new Error('close failed'));

    await expect(store.close()).rejects.toThrow('close failed');
    store.db.close = originalClose;
  });
});
