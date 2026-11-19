// MH-07 BT1 – unit tests of the staff booking service (services/staffBookingService.js, staffHikerService.js),
// written from the story, the PO answers and docs/openapi.yaml (POST /api/staff/bookings, NewStaffBooking,
// StaffNewHiker, TemporaryHiker, StaffBooking). Real SQLite (temporary DB of setupTestDb.js), clock fixed,
// emails captured (NODE_ENV=test); DAO functions are replaced only to reach the safety nets.
//
//   S1 Exactly one of hikerId / newHiker / temporaryHiker, then the same body checks as POST /api/bookings.
//   S2 Existing hiker: booked as is; the answer says for whom (HikerSummary), no generated password; email sent.
//   S3 New full hiker (PO #36): a regular hiker is created with a random generated password (stored hashed,
//      returned once), who must change it at the first login; email sent.
//   S4 Temporary hiker (PO #5): name and optional phone, no email and no password, so no login and no email.
//   S5 Same availability and table rules as MH-01 (allocation, seats, one booking per hiker per slot), except the
//      2-hour rule: staff can book up to the start of the slot, not after (PO #35).
//   S6 One transaction: when the booking is refused, no hiker is created.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setNow } from '../../../src/clock.js';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import { getDb } from '../../../src/dao/db.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import * as userDao from '../../../src/dao/userDao.js';
import { capturedEmails, clearCapturedEmails } from '../../../src/notifications/mailer.js';
import { MESSAGES as AUTH, verifyPassword } from '../../../src/services/authService.js';
import { createStaffBooking } from '../../../src/services/staffBookingService.js';
import {
  createPreparedHiker,
  MESSAGES as SEARCH,
  prepareFullHiker,
  prepareTemporaryHiker,
  validateSearchQuery,
} from '../../../src/services/staffHikerService.js';
import { useFixedClock } from '../../helpers/fixedClock.js';

// "Now": Monday 2 Nov 2026, 10:00 in the hut.
const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
useFixedClock(`${TODAY}T10:00`);

const ERR = {
  choice: 'Give exactly one of hikerId, newHiker or temporaryHiker',
  body: 'Booking details are required',
  hikerId: 'hikerId must be a positive integer',
  invalidBooking: 'slotId and partySize must be positive integers',
  slotNotFound: 'Slot not found',
  hikerNotFound: 'Hiker not found',
  closed: 'This slot is closed',
  started: 'This slot has already started',
  seats: 'Not enough seats available for this party',
  alreadyBooked: 'This hiker already has a booking for this slot',
  email: 'Email already in use',
};
const PAOLO = { firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+39 333 5551234' };
const GIULIA = { firstName: 'Giulia', phone: '+39 333 7654321' };
// Characters of the generated password (no 0/O, 1/l/I: easy to read out to a hiker).
const PASSWORD_CHARS = /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/;

let db;
let n = 0;

async function clearDb() {
  for (const table of ['booking_requirements', 'booking_tables', 'bookings', 'slot_tables', 'slots',
    'password_resets', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

const hikerAccount = (fields = {}) =>
  userDao.create(db, {
    email: `hiker-${++n}@example.com`, firstName: 'Hannah', lastName: 'Hiker', phone: '+393331234567', role: 'hiker',
    ...fields,
  });

/** A slot of tomorrow (unless `date` is given) with tables of `seats` places: T1, T2, … */
const newSlot = ({ date = TOMORROW, startTime = '19:00', status = 'open', seats = [4, 4, 6] } = {}) =>
  slotDao.create(db, {
    date, startTime, endTime: '20:30', label: 'Dinner', status,
    tables: seats.map((places, i) => ({ name: `T${i + 1}`, seats: places })),
  });

const userCount = async () => (await db.get('SELECT COUNT(*) AS n FROM users')).n;
const bookingCount = async () => (await db.get('SELECT COUNT(*) AS n FROM bookings')).n;
const seatsOf = (booking) => booking.tables.map(({ tableName, seats }) => `${tableName}:${seats}`).join('+');

/** Expects createStaffBooking(body) to be refused with `status` and `message`. */
const expectRefused = (body, status, message) =>
  expect(createStaffBooking(body)).rejects.toMatchObject({ status, message });

beforeEach(async () => {
  db = await getDb();
  await clearDb();
  clearCapturedEmails();
});
afterEach(() => vi.restoreAllMocks());

// ---------- S1 the body ----------

describe('S1: who the booking is for, and the booking details', () => {
  it.each([
    ['no body', undefined, ERR.body],
    ['a list', [], ERR.body],
    ['a text', 'book', ERR.body],
    ['none of the three', { slotId: 1, partySize: 2 }, ERR.choice],
    ['two of them', { hikerId: 1, temporaryHiker: GIULIA, slotId: 1, partySize: 2 }, ERR.choice],
    ['all three', { hikerId: 1, newHiker: PAOLO, temporaryHiker: GIULIA, slotId: 1, partySize: 2 }, ERR.choice],
    ['hikerId 0', { hikerId: 0, slotId: 1, partySize: 2 }, ERR.hikerId],
    ['hikerId as text', { hikerId: '4', slotId: 1, partySize: 2 }, ERR.hikerId],
    ['hikerId 1.5', { hikerId: 1.5, slotId: 1, partySize: 2 }, ERR.hikerId],
    ['no slot', { hikerId: 1, partySize: 2 }, ERR.invalidBooking],
    ['party of 0', { hikerId: 1, slotId: 1, partySize: 0 }, ERR.invalidBooking],
  ])('%s → 400', async (_what, body, message) => {
    await expectRefused(body, 400, message);
  });

  it('checks the requirements as POST /api/bookings does (MH-05)', async () => {
    await expect(
      createStaffBooking({ hikerId: 1, slotId: 1, partySize: 2, requirements: [{ hasAllergies: true, description: ' ' }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['a missing last name', { ...PAOLO, lastName: '' }, AUTH.staffHikerRequired],
    ['a missing email', { ...PAOLO, email: undefined }, AUTH.staffHikerRequired],
    ['an invalid email', { ...PAOLO, email: 'paolo.example.com' }, AUTH.invalidEmail],
    ['an invalid phone', { ...PAOLO, phone: '123' }, AUTH.invalidPhone],
    ['notes that are not text', { ...PAOLO, notes: 5 }, AUTH.invalidOptional],
    ['no details at all', null, AUTH.staffHikerRequired],
  ])('newHiker with %s → 400, nothing created', async (_what, newHiker, message) => {
    const slot = await newSlot();
    await expectRefused({ newHiker, slotId: slot.id, partySize: 2 }, 400, message);
    expect(await userCount()).toBe(0);
  });

  it.each([
    ['no first name', { phone: GIULIA.phone }, AUTH.temporaryHikerNameRequired],
    ['a blank first name', { firstName: '  ' }, AUTH.temporaryHikerNameRequired],
    ['a last name that is not text', { firstName: 'Giulia', lastName: 3 }, 'lastName must be text'],
    ['a phone that is not text', { firstName: 'Giulia', phone: 333 }, AUTH.invalidPhone],
    ['an invalid phone', { firstName: 'Giulia', phone: '12' }, AUTH.invalidPhone],
    ['no details at all', null, AUTH.temporaryHikerNameRequired],
  ])('temporaryHiker with %s → 400, nothing created', async (_what, temporaryHiker, message) => {
    const slot = await newSlot();
    await expectRefused({ temporaryHiker, slotId: slot.id, partySize: 2 }, 400, message);
    expect(await userCount()).toBe(0);
  });
});

// ---------- S2 existing hiker ----------

describe('S2: an existing hiker', () => {
  it('books for the hiker: the booking, for whom (no password), and the confirmation email', async () => {
    const hiker = await hikerAccount();
    const slot = await newSlot();
    const requirements = [{ hasAllergies: true, description: '1 peanut allergy' }];

    const booking = await createStaffBooking({ hikerId: hiker.id, slotId: slot.id, partySize: 4, requirements });

    expect(booking).toMatchObject({
      slot: { id: slot.id, date: TOMORROW, startTime: '19:00', label: 'Dinner' },
      partySize: 4,
      requirements,
      status: 'confirmed',
      createdAt: new Date(2026, 10, 2, 10, 0).toISOString(),
      hiker: {
        id: hiker.id, firstName: 'Hannah', lastName: 'Hiker', email: hiker.email, phone: '+393331234567',
        temporary: false,
      },
    });
    expect(booking).not.toHaveProperty('hikerId');
    expect(booking).not.toHaveProperty('generatedPassword');
    expect((await bookingDao.findById(db, booking.id)).hikerId).toBe(hiker.id);
    const [email] = capturedEmails(hiker.email);
    expect(email.subject).toBe('Your booking at the mountain hut is confirmed');
    expect(email.text).toContain('[ALLERGY] 1 peanut allergy');
  });

  it.each([
    ['an unknown id', async () => 999999],
    ['an employee', async () => (await userDao.create(db, { email: 'e@example.com', firstName: 'Eva', role: 'employee' })).id],
    ['a warden', async () => (await userDao.create(db, { email: 'w@example.com', firstName: 'Walt', role: 'warden' })).id],
  ])('hikerId of %s → 404 "Hiker not found"', async (_what, idOf) => {
    const slot = await newSlot();
    await expectRefused({ hikerId: await idOf(), slotId: slot.id, partySize: 2 }, 404, ERR.hikerNotFound);
    expect(await bookingCount()).toBe(0);
  });

  it('a temporary hiker found with the search can be booked again by id', async () => {
    const first = await createStaffBooking({ temporaryHiker: GIULIA, slotId: (await newSlot()).id, partySize: 2 });
    const later = await newSlot({ date: '2026-11-05' });

    const booking = await createStaffBooking({ hikerId: first.hiker.id, slotId: later.id, partySize: 3 });

    expect(booking.hiker).toEqual(first.hiker);
    expect(await userCount()).toBe(1);
  });
});

// ---------- S3 new full hiker ----------

describe('S3: a new full hiker', () => {
  it('creates a regular hiker with a generated password, returned once, who must change it', async () => {
    const slot = await newSlot();

    const booking = await createStaffBooking({
      newHiker: { ...PAOLO, notes: '  arrives late ', emergencyContact: '' }, slotId: slot.id, partySize: 2,
    });

    expect(booking.generatedPassword).toMatch(PASSWORD_CHARS);
    expect(booking.hiker).toEqual({
      id: expect.any(Number), firstName: 'Paolo', lastName: 'Neri', email: PAOLO.email, phone: '+393335551234',
      temporary: false,
    });
    const credentials = await userDao.findCredentialsByEmail(db, PAOLO.email);
    expect(credentials).toMatchObject({ role: 'hiker', mustChangePassword: true });
    expect(credentials.passwordHash).not.toContain(booking.generatedPassword); // stored hashed only
    expect(await verifyPassword(booking.generatedPassword, credentials.passwordHash)).toBe(true);
    const row = await db.get('SELECT notes, emergency_contact FROM users WHERE id = ?', [booking.hiker.id]);
    expect(row).toEqual({ notes: 'arrives late', emergency_contact: null });
    expect(capturedEmails(PAOLO.email)).toHaveLength(1);
  });

  it('every new hiker gets a different password', async () => {
    const slot = await newSlot();
    const a = await createStaffBooking({ newHiker: PAOLO, slotId: slot.id, partySize: 2 });
    const b = await createStaffBooking({ newHiker: { ...PAOLO, email: 'paolo2@example.com' }, slotId: slot.id, partySize: 2 });
    expect(a.generatedPassword).not.toBe(b.generatedPassword);
  });

  it.each([
    ['as typed', PAOLO.email],
    ['in other letter case', 'PAOLO.Neri@Example.com'],
  ])('an email already registered (%s) → 409, no booking and no new hiker', async (_what, email) => {
    await hikerAccount({ email: PAOLO.email });
    const slot = await newSlot();

    await expectRefused({ newHiker: { ...PAOLO, email }, slotId: slot.id, partySize: 2 }, 409, ERR.email);

    expect(await userCount()).toBe(1);
    expect(await bookingCount()).toBe(0);
  });
});

// ---------- S4 temporary hiker ----------

describe('S4: a temporary hiker', () => {
  it('creates a hiker with name and phone only: no email, no password, no email sent', async () => {
    const slot = await newSlot();

    const booking = await createStaffBooking({ temporaryHiker: { ...GIULIA, lastName: ' Bianchi ' }, slotId: slot.id, partySize: 4 });

    expect(booking.hiker).toEqual({
      id: expect.any(Number), firstName: 'Giulia', lastName: 'Bianchi', email: null, phone: '+393337654321',
      temporary: true,
    });
    expect(booking).not.toHaveProperty('generatedPassword');
    const row = await db.get('SELECT email, password_hash, role FROM users WHERE id = ?', [booking.hiker.id]);
    expect(row).toEqual({ email: null, password_hash: null, role: 'hiker' });
    expect(capturedEmails()).toEqual([]);
  });

  it.each([
    ['only a first name', { firstName: 'Giulia' }],
    ['blank last name and phone', { firstName: 'Giulia', lastName: '  ', phone: ' ' }],
    ['null last name and phone', { firstName: 'Giulia', lastName: null, phone: null }],
  ])('with %s: last name and phone are null', async (_what, temporaryHiker) => {
    const booking = await createStaffBooking({ temporaryHiker, slotId: (await newSlot()).id, partySize: 1 });
    expect(booking.hiker).toMatchObject({ firstName: 'Giulia', lastName: null, phone: null, temporary: true });
  });
});

// ---------- S5 same rules as MH-01 ----------

describe('S5: the availability and table rules of MH-01', () => {
  it.each([
    [[8, 4, 4], 8, 'T1:8'], // one table, the one that fits exactly
    [[6, 4, 4], 8, 'T2:4+T3:4'], // fewest tables, then fewest seats left over: big tables stay whole
    [[6, 4, 4], 5, 'T1:5'],
  ])('tables %j, party of %i → %s', async (seats, partySize, expected) => {
    const slot = await newSlot({ seats });
    const booking = await createStaffBooking({ temporaryHiker: GIULIA, slotId: slot.id, partySize });
    expect(seatsOf(booking)).toBe(expected);
  });

  it('counts the seats of the other bookings, not the cancelled ones', async () => {
    const slot = await newSlot({ seats: [4, 4] });
    const other = await hikerAccount();
    await bookingDao.create(db, { slotId: slot.id, hikerId: other.id, partySize: 4, createdAt: '2026-11-01T08:00:00Z',
      tables: [{ slotTableId: slot.tables[0].id, seats: 4 }] });
    const gone = await hikerAccount();
    await bookingDao.create(db, { slotId: slot.id, hikerId: gone.id, partySize: 4, createdAt: '2026-11-01T08:00:00Z',
      status: 'cancelled', tables: [{ slotTableId: slot.tables[1].id, seats: 4 }] });

    const booking = await createStaffBooking({ temporaryHiker: GIULIA, slotId: slot.id, partySize: 4 });

    expect(seatsOf(booking)).toBe('T2:4');
  });

  it('a party bigger than the free seats → 409, and a new hiker is not created (one transaction)', async () => {
    const slot = await newSlot({ seats: [4] });
    await expectRefused({ newHiker: PAOLO, slotId: slot.id, partySize: 5 }, 409, ERR.seats);
    await expectRefused({ temporaryHiker: GIULIA, slotId: slot.id, partySize: 5 }, 409, ERR.seats);
    expect(await userCount()).toBe(0);
    expect(capturedEmails()).toEqual([]);
  });

  it('one booking per hiker per slot → 409; a cancelled one does not count', async () => {
    const hiker = await hikerAccount();
    const slot = await newSlot();
    const first = await createStaffBooking({ hikerId: hiker.id, slotId: slot.id, partySize: 2 });

    await expectRefused({ hikerId: hiker.id, slotId: slot.id, partySize: 2 }, 409, ERR.alreadyBooked);

    await db.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [first.id]);
    await expect(createStaffBooking({ hikerId: hiker.id, slotId: slot.id, partySize: 2 })).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it('unknown slot → 404; closed slot → 400; nothing created', async () => {
    await expectRefused({ temporaryHiker: GIULIA, slotId: 999999, partySize: 2 }, 404, ERR.slotNotFound);
    const closed = await newSlot({ status: 'closed' });
    await expectRefused({ temporaryHiker: GIULIA, slotId: closed.id, partySize: 2 }, 400, ERR.closed);
    expect(await userCount()).toBe(0);
  });

  it('staff can book up to the start of the slot, also inside the 2 hours that close it for hikers', async () => {
    const lunch = await newSlot({ date: TODAY, startTime: '12:00' });
    setNow(`${TODAY}T11:59`);
    await expect(createStaffBooking({ temporaryHiker: GIULIA, slotId: lunch.id, partySize: 2 })).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it.each([
    ['at the start', '12:00'],
    ['after the start', '13:30'],
  ])('%s of the slot → 400 "This slot has already started", nothing created', async (_when, time) => {
    const lunch = await newSlot({ date: TODAY, startTime: '12:00' });
    setNow(`${TODAY}T${time}`);
    await expectRefused({ temporaryHiker: GIULIA, slotId: lunch.id, partySize: 2 }, 400, ERR.started);
    expect(await userCount()).toBe(0);
  });
});

// ---------- S6 safety nets of the transaction ----------

describe('S6: safety nets', () => {
  it('a second booking that slips past the check is refused by the database index → 409', async () => {
    const hiker = await hikerAccount();
    const slot = await newSlot();
    await createStaffBooking({ hikerId: hiker.id, slotId: slot.id, partySize: 2 });
    vi.spyOn(bookingDao, 'hasConfirmedBooking').mockResolvedValue(false); // as if two requests ran at once

    await expectRefused({ hikerId: hiker.id, slotId: slot.id, partySize: 2 }, 409, ERR.alreadyBooked);
    expect(await bookingCount()).toBe(1);
  });

  it('any other database error is passed on, and rolls everything back', async () => {
    const failure = new Error('disk I/O error');
    vi.spyOn(bookingDao, 'create').mockRejectedValueOnce(failure);

    await expect(createStaffBooking({ temporaryHiker: GIULIA, slotId: (await newSlot()).id, partySize: 2 })).rejects.toBe(
      failure,
    );
    expect(await userCount()).toBe(0);
  });

  it('a hiker that cannot be read back after the booking → 404, and nothing is kept', async () => {
    vi.spyOn(userDao, 'findHikerSummaryById').mockResolvedValueOnce(null);
    await expectRefused({ temporaryHiker: GIULIA, slotId: (await newSlot()).id, partySize: 2 }, 404, ERR.hikerNotFound);
    expect(await bookingCount()).toBe(0);
    expect(await userCount()).toBe(0);
  });
});

// ---------- staffHikerService ----------

describe('staffHikerService', () => {
  it('validateSearchQuery: trimmed text of at least 2 characters, else 400', () => {
    expect(validateSearchQuery('  ro ')).toBe('ro');
    for (const query of [undefined, '', 'r', '  r  ', ['rossi'], 12]) {
      expect(() => validateSearchQuery(query)).toThrow(expect.objectContaining({ status: 400, message: SEARCH.invalidQuery }));
    }
  });

  it('prepareFullHiker: the profile, a hash of a 12-character generated password, a forced change', async () => {
    const prepared = await prepareFullHiker(PAOLO);
    expect(prepared).toMatchObject({ firstName: 'Paolo', email: PAOLO.email, phone: '+393335551234', mustChangePassword: true });
    expect(prepared.generatedPassword).toMatch(PASSWORD_CHARS);
    expect(await verifyPassword(prepared.generatedPassword, prepared.passwordHash)).toBe(true);
  });

  it('the hiker summary is only for hikers (the search and the answers never show staff)', async () => {
    const employee = await userDao.create(db, { email: 'e@example.com', firstName: 'Eva', role: 'employee' });
    expect(await userDao.findHikerSummaryById(db, employee.id)).toBeNull();
    expect(await userDao.findHikerSummaryById(db, 999999)).toBeNull();
  });

  it('prepareTemporaryHiker: no email, no password, no forced change', () => {
    expect(prepareTemporaryHiker(GIULIA)).toEqual({
      firstName: 'Giulia', lastName: null, phone: '+393337654321', email: null, passwordHash: null,
      mustChangePassword: false,
    });
  });

  it('createPreparedHiker: a duplicated email that slips past the check is still 409 (database index)', async () => {
    await hikerAccount({ email: PAOLO.email });
    vi.spyOn(userDao, 'findByEmail').mockResolvedValueOnce(null); // as if two requests ran at once

    await expect(createPreparedHiker(db, await prepareFullHiker(PAOLO))).rejects.toMatchObject({
      status: 409, message: ERR.email,
    });
  });

  it('createPreparedHiker: other database errors are passed on', async () => {
    const failure = Object.assign(new Error('NOT NULL constraint failed: users.first_name'), { code: 'SQLITE_CONSTRAINT' });
    vi.spyOn(userDao, 'create').mockRejectedValueOnce(failure);
    await expect(createPreparedHiker(db, prepareTemporaryHiker(GIULIA))).rejects.toBe(failure);
  });
});
