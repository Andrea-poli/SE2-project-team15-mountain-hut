// MH-07 BT2 – integration tests of the staff APIs, written from the story and docs/openapi.yaml (not from the
// code). Real app, real SQLite (temporary DB of setupTestDb.js), real sessions, captured emails, fixed clock.
//
//   GET  /api/staff/hikers?q=   employee and warden: hikers (also temporary) whose first name, last name,
//                               "first last", email or phone (spaces ignored) contain q, any letter case;
//                               at most 20, by last name then first name; 400 q shorter than 2; 401 guest; 403 hiker
//   POST /api/staff/bookings    employee and warden: book for an existing (hikerId), a new full (newHiker) or a
//                               temporary hiker (temporaryHiker) → 201 StaffBooking + Location; the new full hiker logs
//                               in with the generated password, the temporary one cannot log in; requirements saved;
//                               404 unknown slot, 409 full slot; 401 guest; 403 hiker
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import * as bookingDao from '../../src/dao/bookingDao.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { capturedEmails, clearCapturedEmails } from '../../src/notifications/mailer.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now": Monday 2 Nov 2026, 10:00 in the hut; the dinner is tomorrow.
useFixedClock('2026-11-02T10:00');

const app = createApp();
const SECRET = 'mountain-pass-123';
const STAFF_ONLY = 'Staff only';
const PO_REQUIREMENTS = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

beforeEach(async () => {
  const db = await getDb();
  for (const table of ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots',
    'password_resets', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
  clearCapturedEmails();
});

/** A user of `role` with a password, plus a logged-in agent (the agent keeps the session cookie). */
async function signedIn(role, fields = {}) {
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(await getDb(), {
    email, passwordHash: await hashPassword(SECRET), firstName: 'Sam', lastName: 'Staff', role, ...fields,
  });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: SECRET })).status, 'login').toBe(200);
  return { agent, user };
}

/** A hiker in the database only (no session): `null` email makes a temporary hiker. */
const hiker = async (firstName, lastName, email, phone) =>
  userDao.create(await getDb(), { firstName, lastName, email, phone, role: 'hiker',
    passwordHash: email ? await hashPassword(SECRET) : null });

const dinner = async (seats = [4, 4, 6]) =>
  slotDao.create(await getDb(), { date: '2026-11-03', startTime: '19:00', endTime: '20:30', label: 'Dinner',
    tables: seats.map((places, i) => ({ name: `T${i + 1}`, seats: places })) });

const search = (agent, q) => agent.get('/api/staff/hikers').query(q === undefined ? {} : { q });
const book = (agent, body) => agent.post('/api/staff/bookings').send(body);
const names = (res) => res.body.map(({ firstName, lastName }) => `${firstName} ${lastName ?? ''}`.trim());

// ---------- GET /api/staff/hikers ----------

describe('GET /api/staff/hikers', () => {
  beforeEach(async () => {
    await hiker('Marco', 'Rossi', 'marco.rossi@example.com', '+393331234567');
    await hiker('Anna', 'Rossini', 'anna@example.com', '+393401112233');
    await hiker('Élise', 'Ötzi', 'elise@example.com', '+41791234567');
    await hiker('Giulia', null, null, '+393337654321'); // temporary
    await hiker('Bruno', null, null, null); // temporary, no phone
  });

  it.each([
    ['part of a last name, any case', 'ROSS', ['Marco Rossi', 'Anna Rossini']],
    ['a first name', 'anna', ['Anna Rossini']],
    ['"first last"', 'marco ross', ['Marco Rossi']],
    ['"last first"', 'rossi marco', ['Marco Rossi']],
    ['part of an email', 'anna@exa', ['Anna Rossini']],
    ['a phone with spaces', '333 765', ['Giulia']],
    ['a phone without spaces', '3331234567', ['Marco Rossi']],
    ['accented letters, any case', 'éLISE ötz', ['Élise Ötzi']],
    ['nothing that matches', 'zzz', []],
  ])('finds hikers by %s', async (_what, q, expected) => {
    const { agent } = await signedIn('employee');
    const res = await search(agent, q);
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(expected);
  });

  it('answers HikerSummary items; temporary hikers are found too, marked temporary, without email', async () => {
    const { agent } = await signedIn('employee');
    const res = await search(agent, 'giulia');
    expect(res.body).toEqual([
      { id: expect.any(Number), firstName: 'Giulia', lastName: null, email: null, phone: '+393337654321', temporary: true },
    ]);
    expect((await search(agent, 'marco')).body[0]).toEqual({
      id: expect.any(Number), firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com',
      phone: '+393331234567', temporary: false,
    });
  });

  it('only hikers: staff accounts are never listed', async () => {
    const { agent } = await signedIn('employee', { firstName: 'Rossana' });
    expect(names(await search(agent, 'ross'))).toEqual(['Marco Rossi', 'Anna Rossini']);
  });

  it('by last name then first name; a hiker without last name by first name', async () => {
    await hiker('Luca', 'Verdi', 'luca@order.it', '+393331110001');
    await hiker('Anna', 'Verdi', 'anna@order.it', '+393331110002');
    await hiker('Carla', 'Bassi', 'carla@order.it', '+393331110003');
    await hiker('Zeno', 'Zanetti', null, null);
    const { agent } = await signedIn('employee');

    expect(names(await search(agent, 'order.it'))).toEqual(['Carla Bassi', 'Anna Verdi', 'Luca Verdi']);
    expect(names(await search(agent, 'no'))).toEqual(['Bruno', 'Zeno Zanetti']); // Bruno sorts as "Bruno"
  });

  it('at most 20 hikers', async () => {
    for (let i = 0; i < 22; i++) await hiker(`Zeno${String(i).padStart(2, '0')}`, 'Zz', null, null);
    const { agent } = await signedIn('employee');
    const res = await search(agent, 'zeno');
    expect(res.body).toHaveLength(20);
    expect(names(res)[0]).toBe('Zeno00 Zz');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['one character', 'r'],
    ['one character between spaces', '  r  '],
  ])('q %s → 400', async (_what, q) => {
    const { agent } = await signedIn('employee');
    const res = await search(agent, q);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Type at least 2 characters to search' });
  });

  it('the warden can search too; a hiker gets 403, a guest 401', async () => {
    expect((await search((await signedIn('warden')).agent, 'rossi')).status).toBe(200);
    const asHiker = await search((await signedIn('hiker')).agent, 'rossi');
    expect(asHiker.status).toBe(403);
    expect(asHiker.body).toEqual({ error: STAFF_ONLY });
    expect((await search(request(app), 'rossi')).status).toBe(401);
  });
});

// ---------- POST /api/staff/bookings ----------

describe('POST /api/staff/bookings', () => {
  it('for an existing hiker: 201 with Location, for whom, the requirements; the hiker gets the email', async () => {
    const { agent } = await signedIn('employee');
    const marco = await hiker('Marco', 'Rossi', 'marco.rossi@example.com', '+393331234567');
    const slot = await dinner();

    const res = await book(agent, { hikerId: marco.id, slotId: slot.id, partySize: 7, requirements: PO_REQUIREMENTS });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/bookings/${res.body.id}`);
    expect(res.body).toMatchObject({
      slot: { id: slot.id, date: '2026-11-03' }, partySize: 7, status: 'confirmed', requirements: PO_REQUIREMENTS,
      hiker: { id: marco.id, firstName: 'Marco', lastName: 'Rossi', temporary: false },
    });
    expect(res.body).not.toHaveProperty('generatedPassword');
    // Saved: the hiker sees the same booking, with its requirements.
    const mine = await (await signedInAs(marco.email)).get(`/api/bookings/${res.body.id}`);
    expect(mine.body.requirements).toEqual(PO_REQUIREMENTS);
    const [email] = capturedEmails(marco.email);
    expect(email.text).toContain('[ALLERGY] 1 vegan, peanut allergy');
  });

  it('for a new full hiker: the generated password logs in, and must be changed', async () => {
    const { agent } = await signedIn('employee');
    const slot = await dinner();
    const newHiker = { firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+39 333 5551234' };

    const res = await book(agent, { newHiker, slotId: slot.id, partySize: 2 });

    expect(res.status).toBe(201);
    expect(res.body.hiker).toMatchObject({ firstName: 'Paolo', email: newHiker.email, temporary: false });
    expect(res.body.generatedPassword).toMatch(/^\S{12}$/);
    const login = await request(app).post('/api/auth/login').send({ email: newHiker.email, password: res.body.generatedPassword });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ role: 'hiker', mustChangePassword: true });
    expect(capturedEmails(newHiker.email)).toHaveLength(1);
    // Found by the search afterwards, as a regular hiker.
    expect((await search(agent, 'neri')).body).toEqual([res.body.hiker]);
  });

  it('for a temporary hiker: 201, marked temporary, no email sent, and cannot log in', async () => {
    const { agent } = await signedIn('employee');
    const slot = await dinner();

    const res = await book(agent, {
      temporaryHiker: { firstName: 'Giulia', phone: '+39 333 7654321' }, slotId: slot.id, partySize: 4,
      requirements: [PO_REQUIREMENTS[2]],
    });

    expect(res.status).toBe(201);
    expect(res.body.hiker).toEqual({
      id: expect.any(Number), firstName: 'Giulia', lastName: null, email: null, phone: '+393337654321', temporary: true,
    });
    expect(res.body).not.toHaveProperty('generatedPassword');
    expect(res.body.requirements).toEqual([PO_REQUIREMENTS[2]]);
    expect((await bookingDao.findById(await getDb(), res.body.id)).requirements).toEqual([PO_REQUIREMENTS[2]]);
    expect(capturedEmails()).toEqual([]);
    // No email and no password: there is nothing to log in with, and a reset link cannot be asked for it.
    const row = await (await getDb()).get('SELECT email, password_hash FROM users WHERE id = ?', [res.body.hiker.id]);
    expect(row).toEqual({ email: null, password_hash: null });
    expect((await request(app).post('/api/auth/login').send({ email: '', password: '' })).status).toBe(400);
  });

  it('a full slot → 409 and nobody is created; an unknown slot → 404', async () => {
    const { agent } = await signedIn('employee');
    const slot = await dinner([4]);
    const full = await book(agent, { newHiker: { firstName: 'Paolo', lastName: 'Neri', email: 'p@example.com',
      phone: '+393335551234' }, slotId: slot.id, partySize: 5 });
    expect(full.status).toBe(409);
    expect(full.body).toEqual({ error: 'Not enough seats available for this party' });
    expect(await userDao.findByEmail(await getDb(), 'p@example.com')).toBeNull();

    const unknown = await book(agent, { temporaryHiker: { firstName: 'Giulia' }, slotId: 999999, partySize: 2 });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Slot not found' });
  });

  it('a hiker with a booking in the slot → 409; not exactly one way to say who → 400', async () => {
    const { agent } = await signedIn('employee');
    const marco = await hiker('Marco', 'Rossi', 'marco.rossi@example.com', '+393331234567');
    const slot = await dinner();
    expect((await book(agent, { hikerId: marco.id, slotId: slot.id, partySize: 2 })).status).toBe(201);

    const again = await book(agent, { hikerId: marco.id, slotId: slot.id, partySize: 2 });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'This hiker already has a booking for this slot' });
    const both = await book(agent, { hikerId: marco.id, temporaryHiker: { firstName: 'G' }, slotId: slot.id, partySize: 2 });
    expect(both.status).toBe(400);
    expect(both.body).toEqual({ error: 'Give exactly one of hikerId, newHiker or temporaryHiker' });
  });

  it('the warden can book too; a hiker gets 403, a guest 401; nothing is booked', async () => {
    const slot = await dinner();
    const body = { temporaryHiker: { firstName: 'Giulia' }, slotId: slot.id, partySize: 2 };
    expect((await book((await signedIn('warden')).agent, body)).status).toBe(201);

    const asHiker = await book((await signedIn('hiker')).agent, body);
    expect(asHiker.status).toBe(403);
    expect(asHiker.body).toEqual({ error: STAFF_ONLY });
    expect((await book(request(app), body)).status).toBe(401);
    expect((await (await getDb()).get('SELECT COUNT(*) AS n FROM bookings')).n).toBe(1);
  });
});

/** An agent logged in as the existing user `email` (password SECRET). */
async function signedInAs(email) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: SECRET })).status).toBe(200);
  return agent;
}
