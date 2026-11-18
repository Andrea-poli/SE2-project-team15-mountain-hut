// MH-07 FT2 – the password calls of api/auth.js, from the contract (changePassword, requestPasswordReset,
// confirmPasswordReset), as in auth.test.js: without mocks each calls its endpoint through apiFetch; with
// VITE_USE_MOCKS=true the mock (api/mocks/auth.js) answers like the server and no request is sent.
//
// CONTRACT
//   F5 PUT /api/auth/password {currentPassword, newPassword} → the User; POST /api/auth/password-reset {email} →
//      202, nothing to read (null); GET /api/auth/password-reset/validity?token= (encoded) → 200 / 400;
//      POST /api/auth/password-reset/confirm {token, newPassword} → 204 (null).
//      Errors come back as ApiError with the status and the server message.
//      Mock: the same rules and messages as the server: change (401 not logged in / wrong current password,
//      400 missing / short / same, success clears mustChangePassword); reset request (400 invalid email, the
//      same answer for an unknown email, a new link makes the old one invalid); link check (400 empty, unknown,
//      replaced or used link; checking does not use it up); reset confirm (400 missing,
//      short, bad link; the link works once; the new password logs in, the old one does not; the session of
//      that user ends).
import { setImmediate } from 'node:timers';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAuth(useMocks) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false');
  vi.resetModules(); // also gives a fresh mock, with its starting users
  return import('../../../src/api/auth.js');
}

const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), { status });
const user = { id: 1, firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', phone: '+393401234567',
  role: 'hiker' };

describe('api/auth password calls', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  describe('without mocks (VITE_USE_MOCKS=false)', () => {
    it('changePassword: PUT /api/auth/password with both passwords, resolves to the user', async () => {
      const fetch = vi.fn().mockResolvedValue(reply(200, user));
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(false);

      await expect(auth.changePassword('k7Qp2xWm9aTz', 'my-own-secret-pw')).resolves.toEqual(user);
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/auth/password');
      expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/json' } });
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'k7Qp2xWm9aTz', newPassword: 'my-own-secret-pw' });
    });

    it('requestPasswordReset: POST /api/auth/password-reset with the email; 202 resolves to null', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(false);

      await expect(auth.requestPasswordReset('hiker@example.com')).resolves.toBeNull();
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/auth/password-reset');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ email: 'hiker@example.com' });
    });

    it('confirmPasswordReset: POST /api/auth/password-reset/confirm with token and password; 204 → null', async () => {
      const fetch = vi.fn().mockResolvedValue(reply(204));
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(false);

      await expect(auth.confirmPasswordReset('7f3c9a', 'my-own-secret-pw')).resolves.toBeNull();
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/auth/password-reset/confirm');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ token: '7f3c9a', newPassword: 'my-own-secret-pw' });
    });

    it('checkPasswordResetToken: GET /api/auth/password-reset/validity with the token encoded; 200 resolves', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(false);

      await expect(auth.checkPasswordResetToken('a+b=c&x')).resolves.toBeNull();
      const [path, init] = fetch.mock.lastCall;
      expect(path).toBe('/api/auth/password-reset/validity?token=a%2Bb%3Dc%26x');
      expect(init.method).toBeUndefined(); // GET
      expect(init.body).toBeUndefined();
    });

    it('checkPasswordResetToken: 400 comes back as ApiError with the message', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(reply(400, { error: 'This link is not valid or has expired: ask for a new one' })),
      );
      const auth = await loadAuth(false);
      await expect(auth.checkPasswordResetToken('old')).rejects.toMatchObject({
        name: 'ApiError', status: 400, message: 'This link is not valid or has expired: ask for a new one',
      });
    });

    it('passes on the server refusals as ApiError with status and message', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(reply(401, { error: 'The current password is wrong' }))
          .mockResolvedValueOnce(reply(400, { error: 'Enter a valid email' }))
          .mockResolvedValueOnce(reply(400, { error: 'This link is not valid or has expired: ask for a new one' })),
      );
      const auth = await loadAuth(false);
      await expect(auth.changePassword('wrong', 'my-own-secret-pw')).rejects.toMatchObject({
        name: 'ApiError', status: 401, message: 'The current password is wrong',
      });
      await expect(auth.requestPasswordReset('x')).rejects.toMatchObject({ status: 400, message: 'Enter a valid email' });
      await expect(auth.confirmPasswordReset('old', 'my-own-secret-pw')).rejects.toMatchObject({
        status: 400, message: 'This link is not valid or has expired: ask for a new one',
      });
    });
  });

  describe('with mocks (VITE_USE_MOCKS=true)', () => {
    // As in auth.test.js: the mock answers after a (faked) delay and is loaded with a dynamic import.
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

    async function loadMockAuth() {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const auth = await loadAuth(true);
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      return { auth, fetch };
    }

    /** The token of the last reset link the mock printed on the console (it has no email). */
    function lastMockToken(info) {
      const line = info.mock.calls.map((args) => args.join(' ')).findLast((text) => text.includes('/reset-password'));
      return new URL(line.slice(line.indexOf('/reset-password')), 'http://localhost').searchParams.get('token');
    }

    it('changePassword follows the server rules and clears mustChangePassword', async () => {
      const { auth, fetch } = await loadMockAuth();
      expect((await run(auth.changePassword('generated1', 'my-own-secret-pw'))).error).toMatchObject({ status: 401 });

      const { value: paolo } = await run(auth.login('paolo.neri@example.com', 'generated1'));
      expect(paolo).toMatchObject({ role: 'hiker', mustChangePassword: true });

      expect((await run(auth.changePassword('', 'my-own-secret-pw'))).error).toMatchObject({ status: 400 });
      expect((await run(auth.changePassword('generated1', '1234567'))).error).toMatchObject({
        status: 400, message: 'Password must be at least 8 characters long',
      });
      expect((await run(auth.changePassword('wrong-pass', 'my-own-secret-pw'))).error).toMatchObject({
        status: 401, message: 'The current password is wrong',
      });
      expect((await run(auth.changePassword('generated1', 'generated1'))).error).toMatchObject({ status: 400 });

      const { value: changed } = await run(auth.changePassword('generated1', 'my-own-secret-pw'));
      expect(changed.mustChangePassword ?? false).toBe(false);
      expect(changed).not.toHaveProperty('password');
      expect((await run(auth.me())).value).toEqual(changed);
      expect((await run(auth.login('paolo.neri@example.com', 'generated1'))).error).toMatchObject({ status: 401 });
      expect((await run(auth.login('paolo.neri@example.com', 'my-own-secret-pw'))).value.mustChangePassword ?? false)
        .toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('requestPasswordReset: 400 for an invalid email, the same null for a known and an unknown one', async () => {
      const { auth, fetch } = await loadMockAuth();
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});

      expect((await run(auth.requestPasswordReset('hiker@'))).error).toMatchObject({
        status: 400, message: 'Enter a valid email',
      });
      expect(await run(auth.requestPasswordReset('nobody@example.com'))).toEqual({ value: null });
      expect(info).not.toHaveBeenCalled();
      expect(await run(auth.requestPasswordReset(' HIKER@example.com '))).toEqual({ value: null });
      expect(info).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('confirmPasswordReset: checks, one use per link, the newest link only; then the new password logs in', async () => {
      const { auth, fetch } = await loadMockAuth();
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      await run(auth.requestPasswordReset('hiker@example.com'));
      const old = lastMockToken(info);
      await run(auth.requestPasswordReset('hiker@example.com'));
      const token = lastMockToken(info);
      expect(token).not.toBe(old);

      expect((await run(auth.confirmPasswordReset('', 'my-own-secret-pw'))).error).toMatchObject({ status: 400 });
      expect((await run(auth.confirmPasswordReset(token, '1234567'))).error).toMatchObject({
        status: 400, message: 'Password must be at least 8 characters long',
      });
      const badLink = { status: 400, message: 'This link is not valid or has expired: ask for a new one' };
      expect((await run(auth.confirmPasswordReset('unknown', 'my-own-secret-pw'))).error).toMatchObject(badLink);
      expect((await run(auth.confirmPasswordReset(old, 'my-own-secret-pw'))).error).toMatchObject(badLink);

      await run(auth.login('hiker@example.com', 'hikerpass'));
      expect(await run(auth.confirmPasswordReset(token, 'my-own-secret-pw'))).toEqual({ value: null });
      expect((await run(auth.me())).error).toMatchObject({ status: 401 }); // that user's session ended
      expect((await run(auth.confirmPasswordReset(token, 'another-password'))).error).toMatchObject(badLink);
      expect((await run(auth.login('hiker@example.com', 'hikerpass'))).error).toMatchObject({ status: 401 });
      expect((await run(auth.login('hiker@example.com', 'my-own-secret-pw'))).value).toMatchObject({
        email: 'hiker@example.com',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('checkPasswordResetToken: valid only for the newest unused link, and checking never uses it up', async () => {
      const { auth, fetch } = await loadMockAuth();
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const badLink = { status: 400, message: 'This link is not valid or has expired: ask for a new one' };
      await run(auth.requestPasswordReset('hiker@example.com'));
      const old = lastMockToken(info);
      await run(auth.requestPasswordReset('hiker@example.com'));
      const token = lastMockToken(info);

      expect((await run(auth.checkPasswordResetToken(''))).error).toMatchObject(badLink);
      expect((await run(auth.checkPasswordResetToken('unknown'))).error).toMatchObject(badLink);
      expect((await run(auth.checkPasswordResetToken(old))).error).toMatchObject(badLink);
      expect((await run(auth.checkPasswordResetToken(token))).error).toBeUndefined();
      expect((await run(auth.checkPasswordResetToken(token))).error).toBeUndefined(); // twice: still valid

      expect(await run(auth.confirmPasswordReset(token, 'my-own-secret-pw'))).toEqual({ value: null });
      expect((await run(auth.checkPasswordResetToken(token))).error).toMatchObject(badLink); // used
      expect(fetch).not.toHaveBeenCalled();
    });

    it('confirmPasswordReset: the session of another user stays open', async () => {
      const { auth } = await loadMockAuth();
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      await run(auth.requestPasswordReset('hiker@example.com'));
      const token = lastMockToken(info);
      const { value: eric } = await run(auth.login('employee@example.com', 'employeepass'));

      expect(await run(auth.confirmPasswordReset(token, 'my-own-secret-pw'))).toEqual({ value: null });

      expect((await run(auth.me())).value).toEqual(eric);
    });

    // Mock mode chosen when the module loaded, VITE_USE_MOCKS no longer 'true' when called: the mock is not
    // loaded (dead code in a build without mocks).
    it.each([
      ['changePassword', (m) => m.changePassword('generated1', 'my-own-secret-pw')],
      ['requestPasswordReset', (m) => m.requestPasswordReset('hiker@example.com')],
      ['checkPasswordResetToken', (m) => m.checkPasswordResetToken('7f3c9a')],
      ['confirmPasswordReset', (m) => m.confirmPasswordReset('7f3c9a', 'my-own-secret-pw')],
    ])('%s never loads the mock when VITE_USE_MOCKS is not "true"', async (_name, call) => {
      const auth = await loadAuth(true);
      vi.stubEnv('VITE_USE_MOCKS', 'false');
      await expect(call(auth)).rejects.toThrow('Mocks are off');
    });
  });
});
