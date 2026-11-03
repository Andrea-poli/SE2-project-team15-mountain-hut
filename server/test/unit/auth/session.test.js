import { describe, expect, it } from 'vitest';
import { Store } from 'express-session';
import {
  closeSessionStore,
  createSessionMiddleware,
  getSessionStore,
  logIn,
  logOut,
  SESSION_COOKIE,
} from '../../../src/session.js';

describe('session management', () => {
  it('creates middleware with the expected cookie and supplied store', () => {
    const store = new Store();
    const middleware = createSessionMiddleware(store);

    expect(middleware.store).toBe(store);
    expect(SESSION_COOKIE).toBe('connect.sid');
  });

  it('reuses and closes the shared session store', async () => {
    const store = getSessionStore();
    expect(getSessionStore()).toBe(store);

    await closeSessionStore();
    await expect(store.ready).resolves.toBeUndefined();
  });

  it('does nothing when logging out without a session', async () => {
    await expect(logOut({})).resolves.toBeUndefined();
  });

  it('regenerates the session before saving the user ID during login', async () => {
    const calls = [];
    const req = {
      session: {
        regenerate(callback) {
          calls.push('regenerate');
          req.session = {
            save(saveCallback) {
              calls.push('save');
              saveCallback(null);
            },
          };
          callback(null);
        },
      },
    };

    await logIn(req, { id: 42 });

    expect(calls).toEqual(['regenerate', 'save']);
    expect(req.session.userId).toBe(42);
  });

  it('propagates regenerate and save errors during login', async () => {
    const regenerateError = new Error('regenerate failed');
    await expect(logIn({
      session: {
        regenerate: (callback) => callback(regenerateError),
      },
    }, { id: 1 })).rejects.toBe(regenerateError);

    const saveError = new Error('save failed');
    const session = {
      regenerate: (callback) => callback(null),
      save: (callback) => callback(saveError),
    };
    await expect(logIn({ session }, { id: 42 })).rejects.toBe(saveError);
    expect(session.userId).toBe(42);
  });

  it('propagates destroy errors during logout', async () => {
    const destroyError = new Error('destroy failed');
    await expect(logOut({
      session: {
        destroy: (callback) => callback(destroyError),
      },
    })).rejects.toBe(destroyError);
  });
});
