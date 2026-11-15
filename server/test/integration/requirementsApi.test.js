// MH-05 BT1 – integration tests of the party requirements, written from the story (MH-05, PO issue #29),
// MH-03 (the email lists them) and docs/openapi.yaml. Real app, real SQLite (temporary DB from setupTestDb.js),
// real sessions; data created through the DAOs, clock fixed, emails captured (NODE_ENV=test).
//
//   POST /api/bookings { slotId, partySize, requirements? } → 201 Booking with requirements | 400
//   GET  /api/bookings/:id                                  → the booking with its requirements
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/dao/db.js';
import * as slotDao from '../../src/dao/slotDao.js';
import * as userDao from '../../src/dao/userDao.js';
import { capturedEmails, clearCapturedEmails } from '../../src/notifications/mailer.js';
import { hashPassword } from '../../src/services/authService.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now": Monday 2 Nov 2026, 10:00 in the hut; the slot is tomorrow.
useFixedClock('2026-11-02T10:00');
const TOMORROW = '2026-11-03';

const app = createApp();
const PASSWORD = 'mountain-pass-123';
const INVALID = 'Each requirement needs hasAllergies (true or false) and a description';

// The example of the PO (MH-05 clarifications): three requirements, two with allergies.
const PO_EXAMPLE = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

async function clearDb() {
  const db = await getDb();
  for (const table of ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/** A logged-in hiker (the agent keeps the session cookie). */
async function loggedInHiker() {
  const db = await getDb();
  const email = `hiker-${randomUUID()}@example.com`;
  await userDao.create(db, {
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Hannah',
    lastName: 'Hiker',
    phone: '+393331234567',
    role: 'hiker',
  });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
  return { agent, email };
}

async function createSlot(seats = [4, 4, 6]) {
  const tables = seats.map((n, i) => ({ name: `T${i + 1}`, seats: n }));
  return slotDao.create(await getDb(), {
    date: TOMORROW,
    startTime: '19:00',
    endTime: '20:30',
    label: 'Dinner',
    tables,
  });
}

const count = async (table) => (await (await getDb()).get(`SELECT COUNT(*) AS n FROM ${table}`)).n;

beforeEach(async () => {
  await clearDb();
  clearCapturedEmails();
});

describe('POST /api/bookings with party requirements', () => {
  it.each([
    ['no requirements (field absent)', undefined, []],
    ['an empty list', [], []],
    ['one requirement without allergies', [{ hasAllergies: false, description: '2 vegetarians' }], null],
    ['one requirement with allergies', [{ hasAllergies: true, description: '1 nut allergy' }], null],
    ['the PO example: three requirements, two with allergies', PO_EXAMPLE, null],
  ])('saves a booking with %s and answers with them', async (_what, requirements, expected) => {
    const slot = await createSlot();
    const { agent } = await loggedInHiker();

    const res = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 7, requirements });

    expect(res.status).toBe(201);
    expect(res.body.requirements).toEqual(expected ?? requirements);
  });

  it('keeps the order and the allergies flag of each requirement, and trims the descriptions', async () => {
    const slot = await createSlot();
    const { agent } = await loggedInHiker();

    const res = await agent.post('/api/bookings').send({
      slotId: slot.id,
      partySize: 4,
      requirements: [
        { hasAllergies: false, description: '  2 vegetarians ' },
        { hasAllergies: true, description: '1 lactose intolerance  ' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.requirements).toEqual([
      { hasAllergies: false, description: '2 vegetarians' },
      { hasAllergies: true, description: '1 lactose intolerance' },
    ]);
  });

  it.each([
    ['an empty description', [{ hasAllergies: false, description: '' }]],
    ['a description of spaces only', [{ hasAllergies: true, description: '   ' }]],
    ['a missing allergies flag', [{ description: '2 vegetarians' }]],
    ['an allergies flag that is not true or false', [{ hasAllergies: 'yes', description: '2 vegetarians' }]],
    ['requirements that are not a list', { hasAllergies: false, description: '2 vegetarians' }],
    ['one invalid requirement among valid ones', [...PO_EXAMPLE, { hasAllergies: false, description: '' }]],
  ])('refuses %s with 400 and saves nothing', async (_what, requirements) => {
    const slot = await createSlot();
    const { agent, email } = await loggedInHiker();

    const res = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 2, requirements });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID });
    expect(await count('bookings')).toBe(0);
    expect(await count('booking_requirements')).toBe(0);
    expect(capturedEmails(email)).toEqual([]);
  });

  it('saves no requirements when the booking itself is refused before saving (not enough seats, 409)', async () => {
    const slot = await createSlot([2]);
    const { agent } = await loggedInHiker();

    const res = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 3, requirements: PO_EXAMPLE });

    expect(res.status).toBe(409);
    expect(await count('bookings')).toBe(0);
    expect(await count('booking_requirements')).toBe(0);
  });
});

describe('requirements saved in the same transaction as the booking (contract)', () => {
  // The requirements are written last, after the booking and its tables. A temporary trigger makes that
  // last insert fail: if the three writes were not in one transaction, the booking and its tables would stay.
  it('leaves no booking and no tables when saving the requirements fails', async () => {
    const slot = await createSlot();
    const { agent, email } = await loggedInHiker();
    const db = await getDb();
    await db.exec(`CREATE TEMP TRIGGER fail_requirements BEFORE INSERT ON booking_requirements
                   BEGIN SELECT RAISE(ABORT, 'requirements insert failed'); END;`);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {}); // the 500 is logged by the server
    try {
      const res = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 7, requirements: PO_EXAMPLE });

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
      await db.exec('DROP TRIGGER IF EXISTS temp.fail_requirements');
    }
    expect(await count('bookings')).toBe(0);
    expect(await count('booking_tables')).toBe(0);
    expect(await count('booking_requirements')).toBe(0);
    expect(capturedEmails(email)).toEqual([]);

    // The seats were not taken: the same party can still book, and the requirements are saved this time.
    const again = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 7, requirements: PO_EXAMPLE });
    expect(again.status).toBe(201);
    expect(again.body.requirements).toEqual(PO_EXAMPLE);
  });
});

describe('GET /api/bookings/:id with party requirements', () => {
  it('returns the requirements of the booking, as they were saved', async () => {
    const slot = await createSlot();
    const { agent } = await loggedInHiker();
    const created = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 7, requirements: PO_EXAMPLE });

    const res = await agent.get(`/api/bookings/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.requirements).toEqual(PO_EXAMPLE);
    expect(res.body).toEqual(created.body);
  });

  it('returns an empty list for a booking without requirements', async () => {
    const slot = await createSlot();
    const { agent } = await loggedInHiker();
    const created = await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 2 });

    const res = await agent.get(`/api/bookings/${created.body.id}`);

    expect(res.body.requirements).toEqual([]);
  });

  it('keeps the requirements of each booking apart', async () => {
    const slot = await createSlot();
    const first = await loggedInHiker();
    const second = await loggedInHiker();
    const a = await first.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, partySize: 2, requirements: [PO_EXAMPLE[0]] });
    const b = await second.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, partySize: 2, requirements: [PO_EXAMPLE[2]] });

    expect((await first.agent.get(`/api/bookings/${a.body.id}`)).body.requirements).toEqual([PO_EXAMPLE[0]]);
    expect((await second.agent.get(`/api/bookings/${b.body.id}`)).body.requirements).toEqual([PO_EXAMPLE[2]]);
  });
});

describe('confirmation email with party requirements (MH-03)', () => {
  it('lists every requirement, the allergies marked', async () => {
    const slot = await createSlot();
    const { agent, email } = await loggedInHiker();

    await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 7, requirements: PO_EXAMPLE });

    const [sent] = capturedEmails(email);
    expect(sent.text).toContain('Party requirements:');
    expect(sent.text).toContain('[ALLERGY] 1 vegan, peanut allergy');
    expect(sent.text).toContain('[ALLERGY] 1 shellfish allergy');
    expect(sent.text).toContain('2 vegetarians');
    expect(sent.text).not.toContain('[ALLERGY] 2 vegetarians');
    // In the order the hiker entered them.
    const order = PO_EXAMPLE.map((r) => sent.text.indexOf(r.description));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('has no requirements section when the booking has none', async () => {
    const slot = await createSlot();
    const { agent, email } = await loggedInHiker();

    await agent.post('/api/bookings').send({ slotId: slot.id, partySize: 2 });

    const [sent] = capturedEmails(email);
    expect(sent.text).not.toContain('Party requirements');
  });
});
