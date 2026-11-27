// Data helpers shared by the integration tests of the booking API (MH-06 BT2 change, MH-08 BT1 cancel).
// Real SQLite (the temporary DB of setupTestDb.js): data written through the DAOs, users logged in through the API.
//
//   import { booked, clearDb, createSlot, loggedIn } from '../helpers/bookingApi.js';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { hashPassword } from '../../src/services/authService.js';

export const PASSWORD = 'mountain-pass-123';

/** Empties every table of bookings, slots, hikes and users (children first: hikes keep their hiker, no cascade). */
export async function clearDb() {
  const db = await getDb();
  const tables = ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots', 'hikes', 'users'];
  for (const table of tables) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/**
 * A new user of `role`, logged in on `app`: the agent keeps the session cookie.
 * @param {object} [fields] other user fields, e.g. { phone }
 */
export async function loggedIn(app, role = 'hiker', fields = {}) {
  const db = await getDb();
  const email = `${role}-${randomUUID()}@example.com`;
  const user = await userDao.create(db, {
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Hannah',
    lastName: 'Tester',
    role,
    ...fields,
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status, 'login of the test user').toBe(200);
  return { agent, user: { ...user, email } };
}

/** A slot with its tables; seats = table sizes, e.g. [4, 6] → T1 (4), T2 (6). */
export async function createSlot({
  date,
  startTime = '19:00',
  endTime = '20:30',
  label = 'Dinner',
  status = 'open',
  seats = [4, 4, 6],
}) {
  const db = await getDb();
  return slotDao.create(db, {
    date,
    startTime,
    endTime,
    label,
    status,
    tables: seats.map((n, i) => ({ name: `T${i + 1}`, seats: n })),
  });
}

/** Books through the API; the test stops at once if the MH-01 rules refuse it. */
export async function booked(agent, slotId, partySize) {
  const res = await agent.post('/api/bookings').send({ slotId, partySize });
  expect(res.status, 'booking set up by the test').toBe(201);
  return res.body;
}
