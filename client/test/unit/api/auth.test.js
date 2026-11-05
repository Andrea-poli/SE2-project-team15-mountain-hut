// api/auth.js: with VITE_USE_MOCKS=true the mock answers (no request to the server),
// otherwise every function calls its endpoint through apiFetch.
// useMocks is read when the module loads: every test loads it again with vi.resetModules.
import { setImmediate } from 'node:timers';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAuth(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules();
  return import('../../../src/api/auth.js');
}

const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), { status });

describe('api/auth', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  describe('without mocks (VITE_USE_MOCKS=false)', () => {
    const user = { id: 1, firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', phone: '+393401234567', role: 'hiker' };

    it('calls each auth endpoint with apiFetch', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(false);

      fetch.mockResolvedValueOnce(reply(200, user));
      await expect(auth.login('hiker@example.com', 'hikerpass')).resolves.toEqual(user);
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'hiker@example.com', password: 'hikerpass' }) }),
      );

      const data = { firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', password: 'segretissimo', phone: '+393401234567' };
      fetch.mockResolvedValueOnce(reply(201, user));
      await expect(auth.register(data)).resolves.toEqual(user);
      expect(fetch).toHaveBeenLastCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }));

      fetch.mockResolvedValueOnce(reply(200, user));
      await expect(auth.me()).resolves.toEqual(user);
      expect(fetch.mock.lastCall[0]).toBe('/api/auth/me');
      expect(fetch.mock.lastCall[1].method).toBeUndefined(); // GET

      fetch.mockResolvedValueOnce(reply(204));
      await expect(auth.logout()).resolves.toBeNull();
      expect(fetch).toHaveBeenLastCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    });

    it('passes on the server errors as ApiError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: 'Not logged in' })));
      const auth = await loadAuth(false);
      await expect(auth.me()).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Not logged in' });
    });
  });

  describe('with mocks (VITE_USE_MOCKS=true)', () => {
    // The mock answers after a delay (setTimeout, faked) and is loaded with a dynamic import (real I/O):
    // move the fake clock and let the real event loop run until the answer arrives.
    async function run(promise) {
      let result;
      promise.then(
        (value) => (result = { value }),
        (error) => (result = { error }),
      );
      while (!result) {
        await vi.advanceTimersByTimeAsync(300);
        await new Promise((resolve) => setImmediate(resolve));
      }
      return result;
    }

    it('answers from the mock, without any request to the server', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(true);
      vi.useFakeTimers({ toFake: ['setTimeout'] });

      expect((await run(auth.me())).error).toMatchObject({ status: 401, message: 'Not logged in' });
      const { value: hannah } = await run(auth.login('hiker@example.com', 'hikerpass'));
      expect(hannah).toMatchObject({ firstName: 'Hannah', role: 'hiker' });
      expect(hannah).not.toHaveProperty('password');
      expect((await run(auth.me())).value).toEqual(hannah);
      expect((await run(auth.login('hiker@example.com', 'wrong-pass'))).error).toMatchObject({
        status: 401,
        message: 'Invalid email or password',
      });
      expect((await run(auth.logout())).value).toBeNull();
      expect((await run(auth.me())).error).toMatchObject({ status: 401 });

      const { value: created } = await run(
        auth.register({ firstName: 'Mario', lastName: 'Rossi', email: 'mario.mock@example.com', password: 'segretissimo', phone: '+393401234567' }),
      );
      expect(created).toMatchObject({ firstName: 'Mario', role: 'hiker' });
      expect((await run(auth.me())).value).toEqual(created);

      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
