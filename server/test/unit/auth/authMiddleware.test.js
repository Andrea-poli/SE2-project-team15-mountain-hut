import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import { Forbidden, Unauthorized } from '../../../src/errors.js';
import { hasRole, loadUser, requireLogin, requireRole } from '../../../src/middleware/auth.js';

let db;

beforeEach(async () => {
  db = await getDb();
  await db.run('DELETE FROM users');
});

describe('authentication middleware', () => {
  it('loads the current user from the session and clears sessions for deleted users', async () => {
    const { lastID: userId } = await db.run(
      'INSERT INTO users (first_name, role) VALUES (?, ?)',
      ['Kilian', 'hiker'],
    );
    const next = vi.fn();
    const requestWithoutSession = {};
    await loadUser(requestWithoutSession, {}, next);
    expect(requestWithoutSession.user).toBeNull();
    expect(next).toHaveBeenCalledWith();

    const requestWithUser = { session: { userId } };
    await loadUser(requestWithUser, {}, next);
    expect(requestWithUser.user).toMatchObject({ id: userId, firstName: 'Kilian', role: 'hiker' });

    const deletedUserSession = { userId: -1 };
    await loadUser({ session: deletedUserSession }, {}, next);
    expect(deletedUserSession).not.toHaveProperty('userId');
  });

  it('requires a logged-in user and checks requested roles, including the warden employee rule', () => {
    const next = vi.fn();
    requireLogin({ user: null }, {}, next);
    expect(next.mock.calls.at(-1)[0]).toBeInstanceOf(Unauthorized);

    const hiker = { role: 'hiker' };
    requireLogin({ user: hiker }, {}, next);
    expect(next.mock.calls.at(-1)).toEqual([]);

    requireRole(['employee'], 'Staff only')({ user: null }, {}, next);
    expect(next.mock.calls.at(-1)[0]).toBeInstanceOf(Unauthorized);

    requireRole(['employee'], 'Staff only')({ user: hiker }, {}, next);
    expect(next.mock.calls.at(-1)[0]).toBeInstanceOf(Forbidden);
    expect(next.mock.calls.at(-1)[0].message).toBe('Staff only');

    requireRole(['employee'], 'Staff only')({ user: { role: 'warden' } }, {}, next);
    expect(next.mock.calls.at(-1)).toEqual([]);
  });

  it('matches explicit roles and grants employees access to warden checks only as specified', () => {
    expect(hasRole(null, ['hiker'])).toBe(false);
    expect(hasRole({ role: 'hiker' }, ['hiker'])).toBe(true);
    expect(hasRole({ role: 'employee' }, ['warden'])).toBe(false);
    expect(hasRole({ role: 'warden' }, ['employee'])).toBe(true);
    expect(hasRole({ role: 'warden' }, ['hiker'])).toBe(false);
  });
});
