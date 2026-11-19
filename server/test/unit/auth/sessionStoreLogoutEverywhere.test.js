// MH-07 FT2 – "every open session of that user is logged out" (openapi confirmPasswordReset), seen from the
// session store: destroyAllOf(userId).
//
// CONTRACT
//   B4 Removes every session of that user and only those (other users and guests keep theirs); a store that
//      cannot be used reports the error instead of pretending the user was logged out.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../../src/config.js';
import { SqliteSessionStore } from '../../../src/dao/sessionStore.js';

let store;

const call = (method, ...args) =>
  new Promise((resolve, reject) => store[method](...args, (err, result) => (err ? reject(err) : resolve(result))));

const cookie = { expires: '2030-01-01T00:00:00.000Z' };

afterEach(async () => {
  await store?.close().catch(() => {});
  store = null;
});

describe('SqliteSessionStore.destroyAllOf', () => {
  it("removes every session of the user and only the user's", async () => {
    store = new SqliteSessionStore(config.sessionsDbPath);
    await store.ready;
    await call('set', 'phone', { userId: 7, cookie });
    await call('set', 'laptop', { userId: 7, cookie });
    await call('set', 'other-user', { userId: 8, cookie });
    await call('set', 'user-17', { userId: 17, cookie });
    await call('set', 'guest', { cookie });

    await store.destroyAllOf(7);

    await expect(call('get', 'phone')).resolves.toBeNull();
    await expect(call('get', 'laptop')).resolves.toBeNull();
    await expect(call('get', 'other-user')).resolves.toEqual({ userId: 8, cookie });
    await expect(call('get', 'user-17')).resolves.toEqual({ userId: 17, cookie });
    await expect(call('get', 'guest')).resolves.toEqual({ cookie });
  });

  it('rejects when the sessions file cannot be used', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mountain-hut-sessions-'));
    const broken = new SqliteSessionStore(path.join(dir, 'missing-folder', 'sessions.db'));
    try {
      await expect(broken.destroyAllOf(7)).rejects.toThrow();
    } finally {
      clearInterval(broken.cleanup); // the file never opened: there is nothing to close
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
