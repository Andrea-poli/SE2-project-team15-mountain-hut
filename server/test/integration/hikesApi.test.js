// MH-20 BT1 – integration tests of the hikes API, written from the story, its clarifications and docs/openapi.yaml
// (team rule: tests come from the contract, not from the code). Real app, real SQLite (temporary DB from
// setupTestDb.js), real sessions; the clock is fixed.
//
//   POST /api/hikes   hikers only (401 / 403): destination and route required, passagePoints optional (empty = null),
//                     departure and expected return required, valid YYYY-MM-DDTHH:MM in hut local time; the departure
//                     not in the past (the current minute is accepted), the return after the departure; texts trimmed,
//                     at most 100 / 500 / 500 characters. 201 with the Hike: `planned`, or `inProgress` when it
//                     leaves this very minute. No booking needed, more than one hike allowed (planning question 4).
//   GET /api/hikes    hikers only (401 / 403): only the logged-in hiker's hikes, each with its `state` from the clock;
//                     planned and in-progress first (soonest departure first), then completed (most recent first).
//   Hike.cancelled    (contract 0.3.1, U4 #90; MH-22 clarification, PO issue #53) true only for a hike completed while
//                     still planned; decided by the server, which compares the completion time in hut local time.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { setNow } from '../../src/clock.js';
import { getDb } from '../../src/dao/db.js';
import * as hikeDao from '../../src/dao/hikeDao.js';
import { clearDb, loggedIn as loggedInOn } from '../helpers/bookingApi.js';
import { useFixedClock } from '../helpers/fixedClock.js';

// "Now" for every test: Monday 2 Nov 2026, 10:00 in the hut (09:00 UTC).
const NOW = '2026-11-02T10:00';
const NOW_UTC = '2026-11-02T09:00:00.000Z';
useFixedClock(NOW);

const app = createApp();
const loggedIn = (role = 'hiker') => loggedInOn(app, role);

// The PO example of the MH-20 clarification (destination, route, intermediate passage points).
const HIKE = {
  destination: 'Rifugio Quintino Sella',
  route: 'via the Chiaretto lake',
  passagePoints: 'Lago Chiaretto, Colle del Viso',
  departureAt: '2026-11-03T08:30',
  expectedReturnAt: '2026-11-03T16:00',
};

/** Every field of Hike in the contract (0.3.1), and only those (no hikerId). */
const HIKE_FIELDS = [
  'cancelled',
  'completedAt',
  'createdAt',
  'departureAt',
  'destination',
  'expectedReturnAt',
  'id',
  'passagePoints',
  'route',
  'state',
];

const register = (agent, fields = {}) => agent.post('/api/hikes').send({ ...HIKE, ...fields });

/** A hike written through the DAO for `hiker`: also in the past, which the API refuses. */
async function savedHike(hiker, fields = {}) {
  return hikeDao.create(await getDb(), { ...HIKE, hikerId: hiker.id, createdAt: NOW_UTC, ...fields });
}

/** Marks a hike as completed (MH-22 is a later task: the DAO of U2 is used). */
async function completed(hike, completedAt = NOW_UTC) {
  await hikeDao.complete(await getDb(), hike.id, completedAt);
  return hike;
}

async function hikeCount() {
  return (await (await getDb()).get('SELECT COUNT(*) AS n FROM hikes')).n;
}

function expectError(res, status, message) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: expect.any(String) });
  if (message) expect(res.body.error).toBe(message);
  else expect(res.body.error.length).toBeGreaterThan(0);
}

beforeEach(async () => {
  await clearDb();
});

describe('POST /api/hikes – 201', () => {
  it('registers the PO example: the Hike is planned, completedAt null, createdAt now, no other field', async () => {
    const { agent } = await loggedIn();

    const res = await register(agent);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBeUndefined(); // no Location header (contract)
    expect(Object.keys(res.body).sort()).toEqual(HIKE_FIELDS);
    expect(res.body).toEqual({
      id: expect.any(Number),
      ...HIKE,
      state: 'planned',
      cancelled: false,
      completedAt: null,
      createdAt: NOW_UTC,
    });
  });

  it('saves the hike for the logged-in hiker: it is in their My hikes', async () => {
    const { agent, user } = await loggedIn();

    const created = (await register(agent)).body;

    expect((await agent.get('/api/hikes')).body).toEqual([created]);
    expect((await hikeDao.findById(await getDb(), created.id)).hikerId).toBe(user.id);
  });

  it('accepts no passage points: missing, null, empty or only spaces are all saved as null', async () => {
    const { agent } = await loggedIn();
    const { passagePoints: _none, ...withoutPoints } = HIKE;

    for (const body of [withoutPoints, { ...HIKE, passagePoints: null }, { ...HIKE, passagePoints: '' }]) {
      const res = await agent.post('/api/hikes').send(body);
      expect(res.status).toBe(201);
      expect(res.body.passagePoints).toBeNull();
    }
    expect((await register(agent, { passagePoints: '   ' })).body.passagePoints).toBeNull();
  });

  it('trims the texts', async () => {
    const { agent } = await loggedIn();

    const res = await register(agent, {
      destination: '  Rifugio Quintino Sella ',
      route: '\tvia the Chiaretto lake\n',
      passagePoints: ' Lago Chiaretto ',
    });

    expect(res.body).toMatchObject({
      destination: 'Rifugio Quintino Sella',
      route: 'via the Chiaretto lake',
      passagePoints: 'Lago Chiaretto',
    });
  });

  it('accepts a departure this very minute: the hike is already inProgress', async () => {
    const { agent } = await loggedIn();

    const res = await register(agent, { departureAt: NOW, expectedReturnAt: '2026-11-02T10:01' });

    expect(res.status).toBe(201);
    expect(res.body.state).toBe('inProgress');
  });

  it('accepts the longest texts: 100 characters of destination, 500 of route and of passage points', async () => {
    const { agent } = await loggedIn();

    const res = await register(agent, {
      destination: `  ${'d'.repeat(100)}  `, // the limits apply after trimming
      route: 'r'.repeat(500),
      passagePoints: 'p'.repeat(500),
    });

    expect(res.status).toBe(201);
    expect(res.body.destination).toHaveLength(100);
  });

  it('needs no booking at the hut and allows more than one hike, also at the same time', async () => {
    const { agent } = await loggedIn();

    expect((await register(agent)).status).toBe(201);
    expect((await register(agent, { destination: 'Viso Mozzo' })).status).toBe(201);
    expect((await agent.get('/api/hikes')).body).toHaveLength(2);
  });

  it('accepts a hike over several days, and a return one minute after the departure', async () => {
    const { agent } = await loggedIn();

    expect((await register(agent, { expectedReturnAt: '2026-11-05T18:00' })).status).toBe(201);
    expect((await register(agent, { expectedReturnAt: '2026-11-03T08:31' })).status).toBe(201);
  });
});

describe('POST /api/hikes – 400, nothing saved', () => {
  it.each([
    ['destination is missing', { destination: undefined }],
    ['destination is empty', { destination: '' }],
    ['destination is only spaces', { destination: '   ' }],
    ['destination is not text', { destination: 42 }],
  ])('refuses a request where %s', async (_case, fields) => {
    const { agent } = await loggedIn();

    expectError(await register(agent, fields), 400, 'destination is required');
    expect(await hikeCount()).toBe(0);
  });

  it.each([
    ['route is missing', { route: undefined }],
    ['route is only spaces', { route: ' \n ' }],
  ])('refuses a request where %s', async (_case, fields) => {
    const { agent } = await loggedIn();

    expectError(await register(agent, fields), 400, 'route is required');
    expect(await hikeCount()).toBe(0);
  });

  it.each([
    ['destination over 100 characters', { destination: 'd'.repeat(101) }],
    ['route over 500 characters', { route: 'r'.repeat(501) }],
    ['passage points over 500 characters', { passagePoints: 'p'.repeat(501) }],
    ['passage points that are not text', { passagePoints: ['Lago Chiaretto'] }],
  ])('refuses %s', async (_case, fields) => {
    const { agent } = await loggedIn();

    expectError(await register(agent, fields), 400);
    expect(await hikeCount()).toBe(0);
  });

  it.each([
    ['missing', undefined],
    ['a date without the time', '2026-11-03'],
    ['a space instead of T', '2026-11-03 08:30'],
    ['a one-digit hour', '2026-11-03T8:30'],
    ['with seconds', '2026-11-03T08:30:00'],
    ['with a time zone', '2026-11-03T08:30Z'],
    ['an impossible day', '2026-11-31T08:30'],
    ['an impossible hour', '2026-11-03T24:00'],
    ['an hour skipped by daylight saving time', '2027-03-28T02:30'],
    ['text', 'tomorrow morning'],
    ['a number', 20261103],
  ])('refuses a departure that is %s, with the contract message', async (_case, departureAt) => {
    const { agent } = await loggedIn();

    expectError(await register(agent, { departureAt }), 400, 'departureAt must be YYYY-MM-DDTHH:MM');
    expect(await hikeCount()).toBe(0);
  });

  it.each([
    ['missing', undefined],
    ['a date without the time', '2026-11-03'],
    ['an impossible day', '2027-02-29T16:00'],
  ])('refuses an expected return that is %s', async (_case, expectedReturnAt) => {
    const { agent } = await loggedIn();

    expectError(await register(agent, { expectedReturnAt }), 400, 'expectedReturnAt must be YYYY-MM-DDTHH:MM');
    expect(await hikeCount()).toBe(0);
  });

  it('refuses a departure in the past, also one minute ago', async () => {
    const { agent } = await loggedIn();

    expectError(
      await register(agent, { departureAt: '2026-11-02T09:59', expectedReturnAt: '2026-11-02T16:00' }),
      400,
      'The departure cannot be in the past',
    );
    expectError(
      await register(agent, { departureAt: '2026-11-01T08:30', expectedReturnAt: '2026-11-03T16:00' }),
      400,
      'The departure cannot be in the past',
    );
    expect(await hikeCount()).toBe(0);
  });

  it('refuses an expected return before the departure or at the same time', async () => {
    const { agent } = await loggedIn();

    for (const expectedReturnAt of ['2026-11-03T08:00', '2026-11-03T08:30', '2026-11-02T18:00']) {
      expectError(
        await register(agent, { expectedReturnAt }),
        400,
        'expectedReturnAt must be after departureAt',
      );
    }
    expect(await hikeCount()).toBe(0);
  });

  it('refuses a body that is not an object of fields', async () => {
    const { agent } = await loggedIn();

    expectError(await agent.post('/api/hikes').send([HIKE]), 400);
    expectError(await agent.post('/api/hikes').send('destination=Viso'), 400);
    expect(await hikeCount()).toBe(0);
  });
});

describe('POST /api/hikes – hikers only', () => {
  it('answers 401 to a guest', async () => {
    expectError(await register(request(app)), 401, 'Not logged in');
    expect(await hikeCount()).toBe(0);
  });

  it.each(['employee', 'warden'])('answers 403 to the %s (staff have no hikes of their own)', async (role) => {
    const { agent } = await loggedIn(role);

    expectError(await register(agent), 403, 'Only hikers can register a hike');
    expect(await hikeCount()).toBe(0);
  });
});

describe('GET /api/hikes', () => {
  it('answers an empty list to a hiker with no hikes', async () => {
    const { agent } = await loggedIn();

    const res = await agent.get('/api/hikes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists only the hikes of the logged-in hiker, each with every field of Hike and nothing else', async () => {
    const anna = await loggedIn();
    const marco = await loggedIn();
    await register(marco.agent, { destination: 'Viso Mozzo' });
    const mine = (await register(anna.agent)).body;

    const res = await anna.agent.get('/api/hikes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([mine]);
    expect(Object.keys(res.body[0]).sort()).toEqual(HIKE_FIELDS);
    expect((await marco.agent.get('/api/hikes')).body.map((h) => h.destination)).toEqual(['Viso Mozzo']);
  });

  it('puts planned and in-progress hikes first (soonest departure first), then completed (latest first)', async () => {
    const { agent, user } = await loggedIn();
    await completed(await savedHike(user, { destination: 'Done long ago', departureAt: '2026-10-01T08:00' }));
    await savedHike(user, {
      destination: 'Next week',
      departureAt: '2026-11-09T08:00',
      expectedReturnAt: '2026-11-09T17:00',
    });
    await completed(await savedHike(user, { destination: 'Done yesterday', departureAt: '2026-11-01T08:00' }));
    await savedHike(user, {
      destination: 'On the way',
      departureAt: '2026-11-02T07:00',
      expectedReturnAt: '2026-11-02T15:00',
    });
    await savedHike(user, { destination: 'Tomorrow' });

    const res = await agent.get('/api/hikes');

    expect(res.body.map(({ destination, state }) => [destination, state])).toEqual([
      ['On the way', 'inProgress'],
      ['Tomorrow', 'planned'],
      ['Next week', 'planned'],
      ['Done yesterday', 'completed'],
      ['Done long ago', 'completed'],
    ]);
  });

  it('computes the state from the clock: planned, then inProgress from the departure, also when overdue', async () => {
    const { agent } = await loggedIn();
    await register(agent, { departureAt: '2026-11-02T12:00', expectedReturnAt: '2026-11-02T16:00' });
    const state = async () => (await agent.get('/api/hikes')).body[0].state;

    expect(await state()).toBe('planned');
    setNow('2026-11-02T11:59');
    expect(await state()).toBe('planned');
    setNow('2026-11-02T12:00');
    expect(await state()).toBe('inProgress');
    setNow('2026-11-03T09:00'); // overdue: still in progress until the hiker confirms (MH-22)
    expect(await state()).toBe('inProgress');
  });

  it('shows a completed hike as completed, with its completedAt', async () => {
    const { agent, user } = await loggedIn();
    const hike = await completed(
      await savedHike(user, { departureAt: '2026-11-01T08:00', expectedReturnAt: '2026-11-01T16:00' }),
      '2026-11-01T15:10:00.000Z',
    );

    const [shown] = (await agent.get('/api/hikes')).body;

    expect(shown).toMatchObject({
      id: hike.id,
      state: 'completed',
      cancelled: false,
      completedAt: '2026-11-01T15:10:00.000Z',
    });
  });

  it('tells a cancellation (completed while still planned) from a safe arrival, in hut local time', async () => {
    const { agent, user } = await loggedIn();
    const show = (hikes) => hikes.map(({ destination, state, cancelled }) => [destination, state, cancelled]);
    /** A hike of `user` that left at `departureAt` (09:30), back expected at 12:00 the same day. */
    const pastHike = (destination, departureAt) =>
      savedHike(user, { destination, departureAt, expectedReturnAt: `${departureAt.slice(0, 11)}12:00` });
    // Completed now (10:00) with the departure tomorrow: the hiker did not leave.
    await completed(await savedHike(user, { destination: 'Cancelled' }), NOW_UTC);
    // Departure 09:30, back at 10:15 local = 09:15 UTC: a safe arrival, although 09:15 < 09:30 as text.
    await completed(
      await pastHike('Back after 45 min', '2026-11-01T09:30'),
      '2026-11-01T09:15:00.000Z',
    );
    // Summer time (UTC+2): departure 09:30, back at 11:15 local = 09:15 UTC.
    await completed(
      await pastHike('Summer', '2026-07-15T09:30'),
      '2026-07-15T09:15:00.000Z',
    );
    // Completed at the departure minute: the hike had started (inProgress from the departure, included).
    await completed(
      await pastHike('At the departure', '2026-06-01T09:30'),
      '2026-06-01T07:30:00.000Z',
    );
    await savedHike(user, { destination: 'Planned' });

    const res = await agent.get('/api/hikes');

    expect(show(res.body)).toEqual([
      ['Planned', 'planned', false],
      ['Cancelled', 'completed', true],
      ['Back after 45 min', 'completed', false],
      ['Summer', 'completed', false],
      ['At the departure', 'completed', false],
    ]);
  });

  it('answers 401 to a guest', async () => {
    expectError(await request(app).get('/api/hikes'), 401, 'Not logged in');
  });

  it.each(['employee', 'warden'])('answers 403 to the %s, with the contract message', async (role) => {
    const { agent } = await loggedIn(role);

    expectError(await agent.get('/api/hikes'), 403, 'Only hikers have hikes');
  });
});
