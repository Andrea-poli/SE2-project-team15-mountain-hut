// MH-20 BT1 – unit tests of services/hikeService.js: the checks of a new hike (validateNewHike), the state of a hike
// (hikeState), the Hike sent to the client (toHike), hut-local times (localDateTime) and the two service calls with a
// fixed clock and the temporary DB of setupTestDb.js. The HTTP side is in test/integration/hikesApi.test.js.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as hikeDao from '../../../src/dao/hikeDao.js';
import {
  hikeState,
  isCancelled,
  listMyHikes,
  localDateTime,
  MESSAGES,
  registerHike,
  toHike,
  validateNewHike,
} from '../../../src/services/hikeService.js';
import * as userDao from '../../../src/dao/userDao.js';
import { clearDb } from '../../helpers/bookingApi.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

const NOW = '2026-11-02T10:00';
useFixedClock(NOW);

const HIKE = {
  destination: 'Rifugio Quintino Sella',
  route: 'via the Chiaretto lake',
  passagePoints: 'Lago Chiaretto',
  departureAt: '2026-11-03T08:30',
  expectedReturnAt: '2026-11-03T16:00',
};

/** validateNewHike on HIKE with some fields changed, at NOW. */
const validate = (fields = {}) => validateNewHike({ ...HIKE, ...fields }, NOW);
const refused = (fields, message) =>
  expect(() => validate(fields)).toThrow(expect.objectContaining({ status: 400, message }));

describe('validateNewHike', () => {
  it('returns the five fields, trimmed', () => {
    expect(validate({ destination: ' Viso Mozzo ', route: ' via the lake\n' })).toEqual({
      ...HIKE,
      destination: 'Viso Mozzo',
      route: 'via the lake',
    });
  });

  it('keeps only the fields of a new hike (an id or a hikerId in the body is ignored)', () => {
    expect(validate({ id: 99, hikerId: 7, state: 'completed' })).toEqual(HIKE);
  });

  it('turns missing, null, empty or blank passage points into null', () => {
    for (const passagePoints of [undefined, null, '', '  ']) {
      expect(validate({ passagePoints }).passagePoints, String(passagePoints)).toBeNull();
    }
  });

  it('requires destination and route, as non-empty text', () => {
    for (const destination of [undefined, null, '', ' ', 7, {}]) refused({ destination }, 'destination is required');
    for (const route of [undefined, '', '\t']) refused({ route }, 'route is required');
  });

  it('applies the length limits after trimming: 100, 500 and 500 characters', () => {
    expect(validate({ destination: ` ${'d'.repeat(100)} ` }).destination).toHaveLength(100);
    expect(validate({ route: 'r'.repeat(500), passagePoints: 'p'.repeat(500) }).route).toHaveLength(500);
    refused({ destination: 'd'.repeat(101) }, 'destination must be at most 100 characters');
    refused({ route: 'r'.repeat(501) }, 'route must be at most 500 characters');
    refused({ passagePoints: 'p'.repeat(501) }, 'passagePoints must be at most 500 characters');
  });

  it('refuses passage points that are not text', () => {
    refused({ passagePoints: 12 }, 'passagePoints must be text');
    refused({ passagePoints: ['Lago Chiaretto'] }, 'passagePoints must be text');
  });

  it('requires real hut-local date-times written as YYYY-MM-DDTHH:MM', () => {
    const wrong = [undefined, '2026-11-03', '2026-11-03T08:30:00', '2026-11-31T08:30', '2027-03-28T02:15'];
    for (const departureAt of wrong) {
      refused({ departureAt }, 'departureAt must be YYYY-MM-DDTHH:MM');
    }
    refused({ expectedReturnAt: '2026-11-03 16:00' }, 'expectedReturnAt must be YYYY-MM-DDTHH:MM');
  });

  it('accepts a departure at the current minute, refuses one a minute earlier', () => {
    expect(validate({ departureAt: NOW }).departureAt).toBe(NOW);
    refused({ departureAt: '2026-11-02T09:59' }, MESSAGES.pastDeparture);
  });

  it('requires the expected return after the departure', () => {
    expect(validate({ expectedReturnAt: '2026-11-03T08:31' }).expectedReturnAt).toBe('2026-11-03T08:31');
    refused({ expectedReturnAt: '2026-11-03T08:30' }, MESSAGES.returnBeforeDeparture);
    refused({ expectedReturnAt: '2026-11-02T20:00' }, MESSAGES.returnBeforeDeparture);
  });

  it('treats a body that is missing or not an object as empty', () => {
    for (const body of [undefined, null, 'Viso Mozzo', 42]) {
      expect(() => validateNewHike(body, NOW), String(body)).toThrow('destination is required');
    }
  });
});

describe('hikeState', () => {
  const hike = { departureAt: '2026-11-02T12:00', completedAt: null };

  it('is planned before the departure and inProgress from the departure minute on', () => {
    expect(hikeState(hike, '2026-11-02T11:59')).toBe('planned');
    expect(hikeState(hike, '2026-11-02T12:00')).toBe('inProgress');
    expect(hikeState(hike, '2026-11-05T08:00')).toBe('inProgress');
  });

  it('is completed once completedAt is set, whatever the clock', () => {
    expect(hikeState({ ...hike, completedAt: '2026-11-02T15:00:00.000Z' }, '2026-11-02T11:00')).toBe('completed');
    expect(hikeState({ ...hike, completedAt: '2026-11-02T15:00:00.000Z' }, '2026-11-02T16:00')).toBe('completed');
  });
});

describe('isCancelled', () => {
  const hike = { departureAt: '2026-11-02T09:30', completedAt: null };
  const at = (completedAt) => isCancelled({ ...hike, completedAt });

  it('is false while the hike is not completed', () => {
    expect(isCancelled(hike)).toBe(false);
  });

  it('is true when the hike was completed before its departure (hut local time)', () => {
    expect(at('2026-11-01T18:00:00.000Z')).toBe(true);
    expect(at('2026-11-02T08:29:00.000Z')).toBe(true); // 09:29 in the hut
  });

  it('is false from the departure minute on, also when the UTC time is earlier as text', () => {
    expect(at('2026-11-02T08:30:00.000Z')).toBe(false); // 09:30 in the hut: the hike had started
    expect(at('2026-11-02T09:15:00.000Z')).toBe(false); // 10:15 in the hut, "09:15" < "09:30" as text
  });

  it('uses summer time too (UTC+2)', () => {
    const summer = { departureAt: '2026-07-15T09:30' };
    expect(isCancelled({ ...summer, completedAt: '2026-07-15T07:29:00.000Z' })).toBe(true); // 09:29
    expect(isCancelled({ ...summer, completedAt: '2026-07-15T07:30:00.000Z' })).toBe(false); // 09:30
  });
});

describe('toHike', () => {
  it('gives the Hike of the contract: the state added, hikerId left out', () => {
    const saved = { id: 3, hikerId: 8, ...HIKE, completedAt: null, createdAt: '2026-11-02T09:00:00.000Z' };

    expect(toHike(saved, NOW)).toEqual({
      id: 3,
      ...HIKE,
      state: 'planned',
      cancelled: false,
      completedAt: null,
      createdAt: '2026-11-02T09:00:00.000Z',
    });
  });
});

describe('localDateTime', () => {
  it('writes a Date as hut-local YYYY-MM-DDTHH:MM, with leading zeros', () => {
    expect(localDateTime(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
    expect(localDateTime(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31T23:59');
  });

  it('follows the hut time zone, also in summer', () => {
    expect(localDateTime(new Date('2026-11-02T09:00:00Z'))).toBe('2026-11-02T10:00'); // UTC+1
    expect(localDateTime(new Date('2026-07-15T10:30:00Z'))).toBe('2026-07-15T12:30'); // UTC+2
  });
});

describe('registerHike and listMyHikes', () => {
  let hiker;
  let other;

  beforeEach(async () => {
    await clearDb();
    const db = await getDb();
    const user = (email) => userDao.create(db, {
      email,
      passwordHash: 'x',
      firstName: 'Hannah',
      lastName: 'Hiker',
      role: 'hiker',
    });
    hiker = await user('hannah@example.com');
    other = await user('otto@example.com');
  });

  it('saves the hike for the hiker, with createdAt = now, and answers it as planned', async () => {
    const created = await registerHike(hiker, HIKE);

    expect(created).toEqual({
      id: expect.any(Number),
      ...HIKE,
      state: 'planned',
      cancelled: false,
      completedAt: null,
      createdAt: '2026-11-02T09:00:00.000Z',
    });
    expect((await hikeDao.findById(await getDb(), created.id)).hikerId).toBe(hiker.id);
  });

  it('saves nothing when the hike is refused', async () => {
    await expect(registerHike(hiker, { ...HIKE, route: '' })).rejects.toMatchObject({ status: 400 });

    expect(await listMyHikes(hiker)).toEqual([]);
  });

  it('lists only the hiker\'s own hikes, with the state at this minute', async () => {
    await registerHike(other, { ...HIKE, destination: 'Not mine' });
    await registerHike(hiker, { ...HIKE, departureAt: NOW, expectedReturnAt: '2026-11-02T18:00' });

    expect((await listMyHikes(hiker)).map(({ destination, state }) => [destination, state])).toEqual([
      ['Rifugio Quintino Sella', 'inProgress'],
    ]);
  });
});
