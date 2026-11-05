// Mock of the auth endpoints (VITE_USE_MOCKS=true): the same length limits as the form and the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../../../src/api/mocks/auth.js';

let nextEmail = 0;
const valid = () => ({
  firstName: 'Mario',
  lastName: 'Rossi',
  email: `mario${++nextEmail}@example.com`, // the mock keeps its users: a new email for every test
  password: 'segretissimo',
  phone: '+393401234567',
});

// The mock answers after a delay (setTimeout): run it with fake timers.
async function call(data) {
  const result = register(data).then(
    (user) => ({ user }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return result;
}

describe('mock register: length limits', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it.each([
    ['firstName', 100, 'First name must be 100 characters or fewer'],
    ['lastName', 100, 'Last name must be 100 characters or fewer'],
    ['password', 128, 'The password must be 128 characters or fewer'],
    ['notes', 500, 'Notes must be 500 characters or fewer'],
    ['emergencyContact', 200, 'Emergency contact must be 200 characters or fewer'],
  ])('%s longer than %i characters: 400 "%s"', async (field, max, message) => {
    const { error } = await call({ ...valid(), [field]: 'a'.repeat(max + 1) });
    expect(error).toMatchObject({ status: 400, message });
  });

  it('accepts every field exactly at the limit', async () => {
    const data = {
      ...valid(),
      firstName: 'a'.repeat(100),
      lastName: 'b'.repeat(100),
      password: 'c'.repeat(128),
      notes: 'd'.repeat(500),
      emergencyContact: 'e'.repeat(200),
    };
    const { user, error } = await call(data);
    expect(error).toBeUndefined();
    expect(user).toMatchObject({ firstName: data.firstName, lastName: data.lastName, email: data.email, role: 'hiker' });
  });
});
