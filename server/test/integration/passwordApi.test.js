// MH-07 FT2 – integration tests of the password APIs, written from the story and docs/openapi.yaml (not from the
// code). Real app, real SQLite (temporary DB of setupTestDb.js), real sessions, captured emails, fixed clock.
//
// CONTRACT
//   B1 PUT /api/auth/password {currentPassword, newPassword}: 401 not logged in or wrong current password;
//      400 missing fields, new < 8 characters ("Password must be at least 8 characters long"), new = current;
//      200 the updated User (never the hash), mustChangePassword false (absent counts as false, User schema),
//      the session stays logged in; afterwards only the new password logs in. A refused change changes nothing;
//      of two changes at once with the same current password only one succeeds.
//   B2 A hiker created by staff (POST /api/staff/bookings with newHiker) logs in with the generated password and
//      gets mustChangePassword: true (login and /me) until the change; a self-registered hiker never has it.
//   B3 POST /api/auth/password-reset {email}: always the same 202 for a registered email, an unknown email and a
//      user without a password (temporary hikers cannot ask); 400 "Enter a valid email" for a missing or invalid
//      email. Only a registered user with a password gets an email, with a link
//      <publicUrl>/reset-password?token=…; asking again makes the previous link invalid. A failed email changes
//      nothing in the answer.
//   B4 POST /api/auth/password-reset/confirm {token, newPassword}: 204 with a valid token and a good password; the
//      new password works, the old one does not; mustChangePassword becomes false; the link works once
//      (400 the second time, also for two requests at once); valid 24 hours (PO #44, NIST SP 800-63A-4 3.8):
//      400 after, works just before; unknown token 400 "This link is not valid or has expired: ask for a new one";
//      missing fields or a short password 400 (and the link is not used up); the call logs nobody in; every open
//      session of that user is logged out (the other users' are not).
//   B5 Only the hash of the token is stored, never the token itself (not even in the database file).
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { setNow } from '../../src/clock.js';
import { config } from '../../src/config.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { setTransport } from '../../src/notifications/mailer.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now": Monday 2 Nov 2026, 10:00 in the hut (same day as the other tests and the E2E).
const TODAY = '2026-11-02';
useFixedClock(`${TODAY}T10:00`);

const app = createApp();
const PASSWORD = 'mountain-pass-123';
const NEW_PASSWORD = 'my-own-secret-pw';
const SHORT = 'Password must be at least 8 characters long';
const BAD_LINK = 'This link is not valid or has expired: ask for a new one';
const INVALID_EMAIL = 'Enter a valid email';

// ---------- helpers ----------

async function clearDb() {
  const db = await getDb();
  for (const table of [
    'booking_requirements',
    'booking_tables',
    'bookings',
    'slot_tables',
    'slots',
    'password_resets',
    'users',
  ]) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/** A user created through the DAO; `password: null` makes a user who cannot log in. */
async function createUser({ role = 'hiker', password = PASSWORD, firstName = 'Hannah' } = {}) {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email,
    passwordHash: password === null ? null : await hashPassword(password),
    firstName,
    lastName: 'Tester',
    phone: '+393331234567',
    role,
  });
  return { ...user, email };
}

const login = (agent, email, password) => agent.post('/api/auth/login').send({ email, password });

/** A logged-in agent (keeps the session cookie) for `user`. */
async function loggedInAs(user, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await login(agent, user.email, password);
  expect(res.status, 'login of the test user').toBe(200);
  return agent;
}

const changePassword = (agent, body) => agent.put('/api/auth/password').send(body);
const askReset = (email) => request(app).post('/api/auth/password-reset').send({ email });
const confirmReset = (token, newPassword) =>
  request(app).post('/api/auth/password-reset/confirm').send({ token, newPassword });

const emailsTo = async (email) => (await request(app).get('/api/test/emails').query({ recipient: email })).body;

/** The token of the last reset link emailed to `email` (the link is <publicUrl>/reset-password?token=…). */
async function tokenSentTo(email) {
  const emails = await emailsTo(email);
  expect(emails.length, `reset emails to ${email}`).toBeGreaterThan(0);
  const prefix = `${config.publicUrl}/reset-password?token=`;
  const link = emails.at(-1).text.split(/\s+/).find((word) => word.startsWith(prefix));
  expect(link, 'reset link in the email').toBeDefined();
  return decodeURIComponent(link.slice(prefix.length));
}

/** Asks for a reset link for `user` and returns its token. */
async function resetToken(user) {
  expect((await askReset(user.email)).status).toBe(202);
  return tokenSentTo(user.email);
}

/** Error answers are always { error: "…" } (openapi Error). */
function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: message ?? expect.any(String) });
  if (!message) expect(res.body.error.length).toBeGreaterThan(0);
}

/** A slot of tomorrow with free tables, for the staff bookings. */
async function createSlot() {
  const db = await getDb();
  return slotDao.create(db, {
    date: '2026-11-03',
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner',
    status: 'open',
    tables: [{ name: 'T1', seats: 6 }],
  });
}

/** Staff create a new full hiker with a booking; returns the hiker's email and the generated password. */
async function hikerCreatedByStaff() {
  const employee = await createUser({ role: 'employee', firstName: 'Eric' });
  const staff = await loggedInAs(employee);
  const slot = await createSlot();
  const email = `paolo-${randomUUID()}@example.com`;
  const res = await staff.post('/api/staff/bookings').send({
    newHiker: { firstName: 'Paolo', lastName: 'Neri', email, phone: '+393335551234' },
    slotId: slot.id,
    partySize: 2,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  expect(res.body.generatedPassword).toEqual(expect.any(String));
  return { email, password: res.body.generatedPassword };
}

beforeEach(async () => {
  await clearDb();
  await request(app).delete('/api/test/emails').expect(204);
});

// ---------- B1 PUT /api/auth/password ----------

describe('B1 PUT /api/auth/password', () => {
  it('401 when not logged in', async () => {
    const res = await changePassword(request(app), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expectError(res, 401);
  });

  it('401 "The current password is wrong" with a wrong current password, and the password stays the same', async () => {
    const user = await createUser();
    const agent = await loggedInAs(user);

    const res = await changePassword(agent, { currentPassword: 'not-my-password', newPassword: NEW_PASSWORD });

    expectError(res, 401, 'The current password is wrong');
    expect((await login(request(app), user.email, PASSWORD)).status).toBe(200);
    expect((await login(request(app), user.email, NEW_PASSWORD)).status).toBe(401);
  });

  it.each([
    ['no body', undefined],
    ['no current password', { newPassword: NEW_PASSWORD }],
    ['no new password', { currentPassword: PASSWORD }],
    ['empty current password', { currentPassword: '', newPassword: NEW_PASSWORD }],
    ['empty new password', { currentPassword: PASSWORD, newPassword: '' }],
    ['not text', { currentPassword: PASSWORD, newPassword: 12345678 }],
  ])('400 for missing fields (%s)', async (_case, body) => {
    const user = await createUser();
    const agent = await loggedInAs(user);
    expectError(await changePassword(agent, body), 400);
  });

  it('400 "Password must be at least 8 characters long" for a new password of 7 characters; 8 are enough', async () => {
    const user = await createUser();
    const agent = await loggedInAs(user);

    expectError(await changePassword(agent, { currentPassword: PASSWORD, newPassword: '1234567' }), 400, SHORT);
    expect((await login(request(app), user.email, PASSWORD)).status).toBe(200);

    const ok = await changePassword(agent, { currentPassword: PASSWORD, newPassword: '12345678' });
    expect(ok.status).toBe(200);
  });

  it('400 when the new password is the same as the current one', async () => {
    const user = await createUser();
    const agent = await loggedInAs(user);
    expectError(await changePassword(agent, { currentPassword: PASSWORD, newPassword: PASSWORD }), 400);
  });

  it('200 with the updated user; the session stays logged in; only the new password works', async () => {
    const user = await createUser();
    const agent = await loggedInAs(user);

    const res = await changePassword(agent, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      firstName: 'Hannah',
      lastName: 'Tester',
      email: user.email,
      role: 'hiker',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body.mustChangePassword ?? false).toBe(false);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body);

    expectError(await login(request(app), user.email, PASSWORD), 401, 'Invalid email or password');
    expect((await login(request(app), user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('two changes at once with the same current password: one succeeds, the other finds it wrong', async () => {
    const user = await createUser();
    const phone = await loggedInAs(user);
    const laptop = await loggedInAs(user);

    const answers = await Promise.all([
      changePassword(phone, { currentPassword: PASSWORD, newPassword: 'first-new-password' }),
      changePassword(laptop, { currentPassword: PASSWORD, newPassword: 'second-new-password' }),
    ]);

    expect(answers.map((r) => r.status).sort()).toEqual([200, 401]);
    const winner = answers.find((r) => r.status === 200) === answers[0] ? 'first-new-password' : 'second-new-password';
    const loser = winner === 'first-new-password' ? 'second-new-password' : 'first-new-password';
    expect((await login(request(app), user.email, winner)).status).toBe(200);
    expect((await login(request(app), user.email, loser)).status).toBe(401);
    expect((await login(request(app), user.email, PASSWORD)).status).toBe(401);
  });

  it('works for staff too (any logged-in user with a password)', async () => {
    for (const role of ['employee', 'warden']) {
      const user = await createUser({ role });
      const agent = await loggedInAs(user);
      const res = await changePassword(agent, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status, role).toBe(200);
      expect(res.body.role).toBe(role);
      expect((await login(request(app), user.email, NEW_PASSWORD)).status, role).toBe(200);
    }
  });
});

// ---------- B2 forced change for hikers created by staff ----------

describe('B2 a hiker created by staff must change the password', () => {
  it('logs in with the generated password and gets mustChangePassword: true, also from /me', async () => {
    const { email, password } = await hikerCreatedByStaff();
    const hiker = request.agent(app);

    const res = await login(hiker, email, password);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email, role: 'hiker', mustChangePassword: true });
    expect((await hiker.get('/api/auth/me')).body).toMatchObject({ mustChangePassword: true });
  });

  it('after the change mustChangePassword is false, now and at the next login', async () => {
    const { email, password } = await hikerCreatedByStaff();
    const hiker = request.agent(app);
    await login(hiker, email, password);

    const changed = await changePassword(hiker, { currentPassword: password, newPassword: NEW_PASSWORD });

    expect(changed.status).toBe(200);
    expect(changed.body.mustChangePassword ?? false).toBe(false);
    expect((await hiker.get('/api/auth/me')).body.mustChangePassword ?? false).toBe(false);
    const again = await login(request(app), email, NEW_PASSWORD);
    expect(again.status).toBe(200);
    expect(again.body.mustChangePassword ?? false).toBe(false);
  });

  it('a self-registered hiker is never asked to change the password', async () => {
    const email = `self-${randomUUID()}@example.com`;
    const registered = await request(app).post('/api/auth/register').send({
      firstName: 'Kilian',
      lastName: 'Jornet',
      email,
      password: PASSWORD,
      phone: '+393331234567',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.mustChangePassword ?? false).toBe(false);
    expect((await login(request(app), email, PASSWORD)).body.mustChangePassword ?? false).toBe(false);
  });
});

// ---------- B3 POST /api/auth/password-reset ----------

describe('B3 POST /api/auth/password-reset', () => {
  it('202 for a registered email, with an email holding a link to <publicUrl>/reset-password?token=…', async () => {
    const user = await createUser();

    const res = await askReset(user.email);

    expect(res.status).toBe(202);
    const emails = await emailsTo(user.email);
    expect(emails).toHaveLength(1);
    const escaped = config.publicUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(emails[0].text).toMatch(new RegExp(`${escaped}/reset-password\\?token=[^\\s]{20,}`));
  });

  it('the same 202 for an unknown email and for a user without a password, and no email is sent', async () => {
    const registered = await createUser();
    const noPassword = await createUser({ password: null });
    const unknown = `nobody-${randomUUID()}@example.com`;

    const answers = [];
    for (const email of [registered.email, unknown, noPassword.email]) answers.push(await askReset(email));

    for (const res of answers) expect(res.status).toBe(202);
    const shape = (res) => ({ body: res.body, text: res.text, type: res.headers['content-type'] });
    expect(shape(answers[1])).toEqual(shape(answers[0]));
    expect(shape(answers[2])).toEqual(shape(answers[0]));
    const all = (await request(app).get('/api/test/emails')).body;
    expect(all.map((e) => e.to)).toEqual([registered.email]);
  });

  it('finds the account whatever the case and the spaces around the email', async () => {
    const user = await createUser();
    expect((await askReset(`  ${user.email.toUpperCase()} `)).status).toBe(202);
    expect(await emailsTo(user.email)).toHaveLength(1);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['without @', 'hannah.example.com'],
    ['without domain', 'hannah@'],
    ['not text', 42],
  ])('400 "Enter a valid email" for an email %s', async (_case, email) => {
    const res = await request(app)
      .post('/api/auth/password-reset')
      .send(email === undefined ? {} : { email });
    expectError(res, 400, INVALID_EMAIL);
    expect((await request(app).get('/api/test/emails')).body).toEqual([]);
  });

  it('asking again makes the previous link invalid; the new one works', async () => {
    const user = await createUser();
    const first = await resetToken(user);
    const second = await resetToken(user);
    expect(second).not.toBe(first);

    expectError(await confirmReset(first, NEW_PASSWORD), 400, BAD_LINK);
    expect((await confirmReset(second, NEW_PASSWORD)).status).toBe(204);
  });

  it('still answers 202 when the email cannot be sent', async () => {
    const user = await createUser();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTransport({ sendMail: () => Promise.reject(new Error('SMTP down')) });
    try {
      expect((await askReset(user.email)).status).toBe(202);
    } finally {
      setTransport(null);
      error.mockRestore();
    }
  });
});

// ---------- B4 POST /api/auth/password-reset/confirm ----------

describe('B4 POST /api/auth/password-reset/confirm', () => {
  it('204 with a valid link: the new password works, the old one does not', async () => {
    const user = await createUser();
    const token = await resetToken(user);

    const res = await confirmReset(token, NEW_PASSWORD);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expectError(await login(request(app), user.email, PASSWORD), 401, 'Invalid email or password');
    expect((await login(request(app), user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('mustChangePassword becomes false for a hiker created by staff', async () => {
    const { email } = await hikerCreatedByStaff();
    const token = await resetToken({ email });

    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);

    const res = await login(request(app), email, NEW_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword ?? false).toBe(false);
  });

  it('the same link a second time: 400, and the second password is not set', async () => {
    const user = await createUser();
    const token = await resetToken(user);
    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);

    expectError(await confirmReset(token, 'another-password'), 400, BAD_LINK);
    expect((await login(request(app), user.email, 'another-password')).status).toBe(401);
  });

  it('two requests at once with the same link: only one succeeds', async () => {
    const user = await createUser();
    const token = await resetToken(user);

    const answers = await Promise.all([confirmReset(token, 'first-password'), confirmReset(token, 'second-password')]);

    expect(answers.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('valid for 24 hours: works one minute before, 400 one minute after', async () => {
    const user = await createUser();
    const early = await resetToken(user); // asked at 10:00 of 2 Nov
    setNow('2026-11-03T09:59');
    expect((await confirmReset(early, NEW_PASSWORD)).status).toBe(204);

    setNow(`${TODAY}T10:00`);
    const late = await resetToken(user);
    setNow('2026-11-03T10:01');
    expectError(await confirmReset(late, 'another-password'), 400, BAD_LINK);
    expect((await login(request(app), user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('400 for an unknown token', async () => {
    await createUser();
    expectError(await confirmReset('0123456789abcdef'.repeat(4), NEW_PASSWORD), 400, BAD_LINK);
  });

  it.each([
    ['no body', undefined],
    ['no token', { newPassword: NEW_PASSWORD }],
    ['no new password', { token: 'abc' }],
    ['empty token', { token: '', newPassword: NEW_PASSWORD }],
    ['token not text', { token: 123, newPassword: NEW_PASSWORD }],
  ])('400 for missing fields (%s)', async (_case, body) => {
    expectError(await request(app).post('/api/auth/password-reset/confirm').send(body), 400);
  });

  it('400 for a short password, and the link still works afterwards', async () => {
    const user = await createUser();
    const token = await resetToken(user);

    expectError(await confirmReset(token, '1234567'), 400, SHORT);
    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);
  });

  it('does not log anybody in', async () => {
    const user = await createUser();
    const token = await resetToken(user);
    const agent = request.agent(app);

    const res = await agent.post('/api/auth/password-reset/confirm').send({ token, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
    expectError(await agent.get('/api/auth/me'), 401);
  });

  it("logs out every open session of that user, and only that user's", async () => {
    const user = await createUser();
    const other = await createUser({ firstName: 'Anna' });
    const phone = await loggedInAs(user);
    const laptop = await loggedInAs(user);
    const otherAgent = await loggedInAs(other);
    const token = await resetToken(user);

    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);

    expectError(await phone.get('/api/auth/me'), 401);
    expectError(await laptop.get('/api/auth/me'), 401);
    expect((await otherAgent.get('/api/auth/me')).status).toBe(200);
  });
});

// ---------- B5 only the hash of the token is stored ----------

describe('B5 the database keeps only the hash of the token', () => {
  it('no column and no byte of the database file holds the token', async () => {
    const user = await createUser();
    const token = await resetToken(user);
    const db = await getDb();

    const rows = await db.all('SELECT * FROM password_resets');
    expect(rows).toHaveLength(1);
    for (const value of Object.values(rows[0])) {
      expect(String(value)).not.toContain(token);
    }
    expect(rows[0].token_hash).toEqual(expect.any(String));
    expect(rows[0].token_hash).not.toBe(token);
    expect((await readFile(config.dbPath)).includes(Buffer.from(token))).toBe(false);
  });
});
