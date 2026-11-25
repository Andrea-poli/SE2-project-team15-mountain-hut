import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as bookingDao from '../../../src/dao/bookingDao.js';
import * as hikeDao from '../../../src/dao/hikeDao.js';
import * as slotDao from '../../../src/dao/slotDao.js';
import { withTransaction } from '../../../src/dao/transaction.js';
import * as userDao from '../../../src/dao/userDao.js';

let db;

async function insertUser(db, { email, firstName = 'Kilian', role = 'hiker' } = {}) {
  const { lastID } = await db.run(
    `INSERT INTO users (email, first_name, last_name, phone, role)
     VALUES (?, ?, ?, ?, ?)`,
    [email, firstName, 'Jornet', '+39300123456', role],
  );
  return lastID;
}

async function insertSlot(db, { date = '2026-12-02', startTime = '12:00', endTime = '14:00', label = 'Lunch' } = {}) {
  const { lastID } = await db.run(
    'INSERT INTO slots (date, start_time, end_time, label) VALUES (?, ?, ?, ?)',
    [date, startTime, endTime, label],
  );
  return lastID;
}

async function insertTable(db, slotId, name, seats) {
  const { lastID } = await db.run(
    'INSERT INTO slot_tables (slot_id, name, seats) VALUES (?, ?, ?)',
    [slotId, name, seats],
  );
  return lastID;
}

async function insertBooking(db, { slotId, hikerId, status = 'confirmed', createdAt = '2026-11-01T10:00:00.000Z' }) {
  const { lastID } = await db.run(
    'INSERT INTO bookings (slot_id, hiker_id, party_size, status, created_at) VALUES (?, ?, 2, ?, ?)',
    [slotId, hikerId, status, createdAt],
  );
  return lastID;
}

beforeEach(async () => {
  db = await getDb();
  await db.exec(`
    DELETE FROM booking_requirements;
    DELETE FROM booking_tables;
    DELETE FROM bookings;
    DELETE FROM hikes;
    DELETE FROM slot_tables;
    DELETE FROM slots;
    DELETE FROM users;
  `);
});

describe('user DAO', () => {
  it('findById returns a user without private fields, or null when absent', async () => {
    const id = await insertUser(db, { email: 'kilian-id@example.com' });
    await db.run('UPDATE users SET password_hash = ?, notes = ? WHERE id = ?', ['secret-hash', 'Guide', id]);

    await expect(userDao.findById(db, id)).resolves.toEqual({
      id,
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian-id@example.com',
      phone: '+39300123456',
      role: 'hiker',
    });
    await expect(userDao.findById(db, -1)).resolves.toBeNull();
  });

  it('findByEmail finds an email case-insensitively', async () => {
    const id = await insertUser(db, { email: 'kilian-email@example.com' });

    await expect(userDao.findByEmail(db, 'KILIAN-EMAIL@example.com')).resolves.toEqual({
      id,
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian-email@example.com',
      phone: '+39300123456',
      role: 'hiker',
    });
    await expect(userDao.findByEmail(db, 'missing@example.com')).resolves.toBeNull();
  });

  it('findCredentialsByEmail includes the password hash only for a matching user', async () => {
    const id = await insertUser(db, { email: 'kilian-login@example.com' });
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', ['scrypt-hash', id]);

    await expect(userDao.findCredentialsByEmail(db, 'kilian-login@example.com')).resolves.toEqual({
      id,
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian-login@example.com',
      phone: '+39300123456',
      role: 'hiker',
      passwordHash: 'scrypt-hash',
    });
    await expect(userDao.findCredentialsByEmail(db, 'missing-login@example.com')).resolves.toBeNull();
  });

  it('create saves optional user details and returns the public user shape', async () => {
    const user = await userDao.create(db, {
      email: 'kilian-create@example.com',
      passwordHash: 'scrypt-hash',
      firstName: 'Kilian',
      lastName: 'Jornet',
      phone: '555-0100',
      notes: 'Mountain guide',
      emergencyContact: 'Grace Hopper',
      role: 'hiker',
    });

    expect(user).toEqual({
      id: expect.any(Number),
      firstName: 'Kilian',
      lastName: 'Jornet',
      email: 'kilian-create@example.com',
      phone: '555-0100',
      role: 'hiker',
    });
    await expect(db.get('SELECT password_hash, notes, emergency_contact FROM users WHERE id = ?', [user.id]))
      .resolves.toEqual({
        password_hash: 'scrypt-hash',
        notes: 'Mountain guide',
        emergency_contact: 'Grace Hopper',
      });
  });
});

describe('slot DAO', () => {
  it('findById returns a slot and its tables, or null when absent', async () => {
    const slotId = await insertSlot(db);
    await insertTable(db, slotId, 'I01', 4);
    await insertTable(db, slotId, 'E02', 2);

    await expect(slotDao.findById(db, slotId)).resolves.toEqual({
      id: slotId,
      date: '2026-12-02',
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      status: 'open',
      menu: null,
      tables: [
        { id: expect.any(Number), name: 'I01', seats: 4 },
        { id: expect.any(Number), name: 'E02', seats: 2 },
      ],
    });
    await expect(slotDao.findById(db, -1)).resolves.toBeNull();
  });

  it('findByDate returns all matching slots ordered by start time with their tables', async () => {
    const laterSlotId = await insertSlot(db, { startTime: '18:00', endTime: '20:00', label: 'Dinner' });
    const earlierSlotId = await insertSlot(db, { startTime: '12:00', endTime: '14:00', label: 'Lunch' });
    await insertSlot(db, { date: '2026-12-03', label: 'Other day' });
    const tableId = await insertTable(db, earlierSlotId, 'A', 4);

    await expect(slotDao.findByDate(db, '2026-12-02')).resolves.toEqual([
      {
        id: earlierSlotId,
        date: '2026-12-02',
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
        status: 'open',
        menu: null,
        tables: [{ id: tableId, name: 'A', seats: 4 }],
      },
      {
        id: laterSlotId,
        date: '2026-12-02',
        startTime: '18:00',
        endTime: '20:00',
        label: 'Dinner',
        status: 'open',
        menu: null,
        tables: [],
      },
    ]);
  });

  it('findInRange includes both endpoints and returns matching tables', async () => {
    await insertSlot(db, { date: '2026-11-01', label: 'Before range' });
    const firstSlotId = await insertSlot(db, { date: '2026-11-02', label: 'First day' });
    const lastSlotId = await insertSlot(db, { date: '2026-11-04', label: 'Last day' });
    const firstTableId = await insertTable(db, firstSlotId, 'I01', 4);

    const slots = await slotDao.findInRange(db, '2026-11-02', '2026-11-04');
    expect(slots.map(({ id }) => id)).toEqual([firstSlotId, lastSlotId]);
    expect(slots[0].tables).toEqual([{ id: firstTableId, name: 'I01', seats: 4 }]);
  });

  it('create inserts a slot and its tables and returns the assembled slot', async () => {
    const slot = await slotDao.create(db, {
      date: '2026-12-02',
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      tables: [
        { name: 'A', seats: 4 },
        { name: 'B', seats: 2 },
      ],
    });

    expect(slot).toMatchObject({
      id: expect.any(Number),
      date: '2026-12-02',
      startTime: '12:00',
      endTime: '14:00',
      label: 'Lunch',
      status: 'open',
      tables: [
        { id: expect.any(Number), name: 'A', seats: 4 },
        { id: expect.any(Number), name: 'B', seats: 2 },
      ],
    });
  });
});

describe('booking DAO', () => {
  it('allocationsForSlot sums confirmed seats by table and excludes cancelled bookings', async () => {
    const slotId = await insertSlot(db);
    const hikerOne = await insertUser(db, { email: 'allocation-one@example.com' });
    const hikerTwo = await insertUser(db, { email: 'allocation-two@example.com' });
    const hikerThree = await insertUser(db, { email: 'allocation-three@example.com' });
    const firstTableId = await insertTable(db, slotId, 'A', 4);
    const secondTableId = await insertTable(db, slotId, 'B', 4);
    const firstBooking = await insertBooking(db, { slotId, hikerId: hikerOne });
    const secondBooking = await insertBooking(db, { slotId, hikerId: hikerTwo });
    const cancelledBooking = await insertBooking(db, { slotId, hikerId: hikerThree, status: 'cancelled' });
    await db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [
      firstBooking,
      firstTableId,
      2,
    ]);
    await db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [
      secondBooking,
      firstTableId,
      1,
    ]);
    await db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [
      cancelledBooking,
      secondTableId,
      2,
    ]);

    await expect(bookingDao.allocationsForSlot(db, slotId)).resolves.toEqual([
      { slotTableId: firstTableId, seats: 3 },
    ]);
  });

  it('create inserts a booking and its table allocations with the default confirmed status', async () => {
    const slotId = await insertSlot(db);
    const hikerId = await insertUser(db, { email: 'booking-create@example.com' });
    const slotTableId = await insertTable(db, slotId, 'A', 4);

    const booking = await bookingDao.create(db, {
      slotId,
      hikerId,
      partySize: 2,
      createdAt: '2026-11-01T10:00:00.000Z',
      tables: [{ slotTableId, seats: 2 }],
    });

    expect(booking).toEqual({
      id: expect.any(Number),
      hikerId,
      slot: {
        id: slotId,
        date: '2026-12-02',
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
      },
      partySize: 2,
      tables: [{ slotTableId, tableName: 'A', seats: 2 }],
      requirements: [],
      status: bookingDao.BOOKING_STATUS.CONFIRMED,
      createdAt: '2026-11-01T10:00:00.000Z',
    });
  });

  it('findById returns a booking with its slot and tables, or null when absent', async () => {
    const slotId = await insertSlot(db);
    const hikerId = await insertUser(db, { email: 'booking-find@example.com' });
    const slotTableId = await insertTable(db, slotId, 'A', 4);
    const bookingId = await insertBooking(db, {
      slotId,
      hikerId,
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    await db.run('INSERT INTO booking_tables (booking_id, slot_table_id, seats) VALUES (?, ?, ?)', [
      bookingId,
      slotTableId,
      2,
    ]);

    await expect(bookingDao.findById(db, bookingId)).resolves.toEqual({
      id: bookingId,
      hikerId,
      slot: {
        id: slotId,
        date: '2026-12-02',
        startTime: '12:00',
        endTime: '14:00',
        label: 'Lunch',
      },
      partySize: 2,
      tables: [{ slotTableId, tableName: 'A', seats: 2 }],
      requirements: [],
      status: 'confirmed',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    await expect(bookingDao.findById(db, -1)).resolves.toBeNull();
  });
});

describe('booking requirements DAO', () => {
  // The example of the PO (MH-05): three requirements, two with allergies. Not in alphabetical order on purpose.
  const PO_EXAMPLE = [
    { hasAllergies: true, description: '1 vegan, peanut allergy' },
    { hasAllergies: true, description: '1 shellfish allergy' },
    { hasAllergies: false, description: '2 vegetarians' },
  ];

  async function newBooking(email) {
    const slotId = await insertSlot(db);
    const hikerId = await insertUser(db, { email });
    return insertBooking(db, { slotId, hikerId });
  }

  it('saves the requirements and reads them back in the order they were entered', async () => {
    const bookingId = await newBooking('requirements-order@example.com');

    await bookingDao.saveRequirements(db, bookingId, PO_EXAMPLE);

    await expect(bookingDao.findRequirements(db, bookingId)).resolves.toEqual(PO_EXAMPLE);
    await expect(
      db.all('SELECT has_allergies FROM booking_requirements WHERE booking_id = ? ORDER BY id', [bookingId]),
    ).resolves.toEqual([{ has_allergies: 1 }, { has_allergies: 1 }, { has_allergies: 0 }]);
  });

  it('gives an empty list for a booking without requirements, and saving an empty list adds nothing', async () => {
    const bookingId = await newBooking('requirements-none@example.com');

    await bookingDao.saveRequirements(db, bookingId, []);

    await expect(bookingDao.findRequirements(db, bookingId)).resolves.toEqual([]);
    await expect(bookingDao.findRequirements(db, 999)).resolves.toEqual([]);
    await expect(db.get('SELECT COUNT(*) AS count FROM booking_requirements')).resolves.toEqual({ count: 0 });
  });

  it('keeps the requirements of each booking apart, also when they are saved in turns', async () => {
    const first = await newBooking('requirements-first@example.com');
    const second = await newBooking('requirements-second@example.com');

    await bookingDao.saveRequirements(db, first, [PO_EXAMPLE[0]]);
    await bookingDao.saveRequirements(db, second, [PO_EXAMPLE[2]]);
    await bookingDao.saveRequirements(db, first, [PO_EXAMPLE[1]]);

    await expect(bookingDao.findRequirements(db, first)).resolves.toEqual([PO_EXAMPLE[0], PO_EXAMPLE[1]]);
    await expect(bookingDao.findRequirements(db, second)).resolves.toEqual([PO_EXAMPLE[2]]);
  });

  it('inside a transaction, a refused requirement leaves neither the booking nor its requirements', async () => {
    const slotId = await insertSlot(db);
    const hikerId = await insertUser(db, { email: 'requirements-rollback@example.com' });
    const slotTableId = await insertTable(db, slotId, 'A', 4);

    await expect(
      withTransaction(db, async () => {
        const booking = await bookingDao.create(db, {
          slotId,
          hikerId,
          partySize: 2,
          createdAt: '2026-11-01T10:00:00.000Z',
          tables: [{ slotTableId, seats: 2 }],
        });
        // The service checks descriptions first; here the CHECK of the table is the last safety net.
        await bookingDao.saveRequirements(db, booking.id, [PO_EXAMPLE[0], { hasAllergies: false, description: '  ' }]);
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await expect(db.get('SELECT COUNT(*) AS count FROM bookings')).resolves.toEqual({ count: 0 });
    await expect(db.get('SELECT COUNT(*) AS count FROM booking_tables')).resolves.toEqual({ count: 0 });
    await expect(db.get('SELECT COUNT(*) AS count FROM booking_requirements')).resolves.toEqual({ count: 0 });
  });
});

// MH-06 BT1 – bookingDao.update(): what is not given stays as it is.
describe('booking DAO – update', () => {
  it('changes slot and party size, and keeps the tables and requirements when they are not given', async () => {
    const slotId = await insertSlot(db);
    const otherSlotId = await insertSlot(db, { date: '2026-12-03' });
    const hikerId = await insertUser(db, { email: 'booking-update@example.com' });
    const slotTableId = await insertTable(db, slotId, 'A', 4);
    const requirements = [{ hasAllergies: true, description: '1 peanut allergy' }];
    const booking = await bookingDao.create(db, {
      slotId,
      hikerId,
      partySize: 2,
      createdAt: '2026-11-01T10:00:00.000Z',
      tables: [{ slotTableId, seats: 2 }],
      requirements,
    });

    const updated = await bookingDao.update(db, booking.id, { slotId: otherSlotId, partySize: 3 });

    expect(updated).toMatchObject({
      slot: { id: otherSlotId },
      partySize: 3,
      tables: [{ slotTableId, tableName: 'A', seats: 2 }],
      requirements,
      status: 'confirmed',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
  });
});

// U2 (sprint 3) – the menu of a slot (MH-10).
describe('slot DAO – menus', () => {
  const POLENTA = '**Polenta** with mushrooms\n- Soup of the day';

  async function slotWithMenu(date, startTime, menu, label = 'Lunch') {
    const id = await insertSlot(db, { date, startTime, endTime: '23:00', label });
    await db.run('UPDATE slots SET menu = ? WHERE id = ?', [menu, id]);
    return id;
  }

  it('setMenu saves, changes and clears the menu and returns the slot; null for an unknown slot', async () => {
    const slotId = await insertSlot(db);
    await insertTable(db, slotId, 'A', 4);

    const saved = await slotDao.setMenu(db, slotId, POLENTA);
    expect(saved).toMatchObject({ id: slotId, menu: POLENTA, tables: [{ name: 'A', seats: 4 }] });
    await expect(slotDao.findById(db, slotId)).resolves.toEqual(saved);
    await expect(slotDao.setMenu(db, slotId, 'Risotto')).resolves.toMatchObject({ menu: 'Risotto' });
    await expect(slotDao.setMenu(db, slotId, null)).resolves.toMatchObject({ id: slotId, menu: null });
    await expect(slotDao.setMenu(db, -1, POLENTA)).resolves.toBeNull();
  });

  it('findPreviousMenus gives each text once with its most recent slot, the most recent first', async () => {
    await slotWithMenu('2026-11-20', '12:00', POLENTA);
    const latestPolenta = await slotWithMenu('2026-11-21', '12:00', POLENTA);
    const soup = await slotWithMenu('2026-11-21', '19:00', 'Barley soup', 'Dinner');
    const older = await slotWithMenu('2026-11-19', '12:00', 'Risotto');
    await insertSlot(db, { date: '2026-11-22', label: 'No menu' });

    await expect(slotDao.findPreviousMenus(db)).resolves.toEqual([
      { menu: 'Barley soup', slotId: soup, date: '2026-11-21', startTime: '19:00', label: 'Dinner' },
      { menu: POLENTA, slotId: latestPolenta, date: '2026-11-21', startTime: '12:00', label: 'Lunch' },
      { menu: 'Risotto', slotId: older, date: '2026-11-19', startTime: '12:00', label: 'Lunch' },
    ]);
  });

  it('findPreviousMenus keeps the texts containing q, ignoring case, and stops at the limit', async () => {
    await slotWithMenu('2026-11-20', '12:00', POLENTA);
    await slotWithMenu('2026-11-21', '12:00', 'Polenta e spezzatino');
    await slotWithMenu('2026-11-22', '12:00', 'Risotto');

    const menus = async (options) => (await slotDao.findPreviousMenus(db, options)).map(({ menu }) => menu);
    await expect(menus({ q: 'POLENTA' })).resolves.toEqual(['Polenta e spezzatino', POLENTA]);
    await expect(menus({ q: 'soup of THE' })).resolves.toEqual([POLENTA]);
    await expect(menus({ q: 'lasagne' })).resolves.toEqual([]);
    await expect(menus({ q: '' })).resolves.toHaveLength(3);
    await expect(menus({ limit: 2 })).resolves.toEqual(['Risotto', 'Polenta e spezzatino']);
  });
});

// U2 (sprint 3) – hikes (MH-20, MH-21, MH-22).
describe('hike DAO', () => {
  const CREATED_AT = '2026-11-27T18:00:00.000Z';
  const hike = (hikerId, departureAt, expectedReturnAt, more = {}) =>
    hikeDao.create(db, {
      hikerId,
      destination: 'Rifugio Sella',
      route: 'via the lake',
      departureAt,
      expectedReturnAt,
      createdAt: CREATED_AT,
      ...more,
    });

  it('create saves a hike and returns it, passage points optional; findById gives null when absent', async () => {
    const hikerId = await insertUser(db, { email: 'hike-create@example.com' });

    const created = await hike(hikerId, '2026-11-28T08:30', '2026-11-28T16:00', { passagePoints: 'Lago Chiaretto' });

    expect(created).toEqual({
      id: expect.any(Number),
      hikerId,
      destination: 'Rifugio Sella',
      route: 'via the lake',
      passagePoints: 'Lago Chiaretto',
      departureAt: '2026-11-28T08:30',
      expectedReturnAt: '2026-11-28T16:00',
      completedAt: null,
      createdAt: CREATED_AT,
    });
    await expect(hikeDao.findById(db, created.id)).resolves.toEqual(created);
    await expect(hike(hikerId, '2026-11-29T08:30', '2026-11-29T16:00')).resolves.toMatchObject({ passagePoints: null });
    await expect(hikeDao.findById(db, -1)).resolves.toBeNull();
  });

  it('findByHiker lists one hiker: not completed (soonest departure first), then completed (latest)', async () => {
    const hikerId = await insertUser(db, { email: 'hike-mine@example.com' });
    const otherId = await insertUser(db, { email: 'hike-other@example.com' });
    const later = await hike(hikerId, '2026-12-05T08:00', '2026-12-05T16:00');
    const sooner = await hike(hikerId, '2026-11-28T08:00', '2026-11-28T16:00');
    const doneOld = await hike(hikerId, '2026-11-20T08:00', '2026-11-20T16:00');
    const doneRecent = await hike(hikerId, '2026-11-25T08:00', '2026-11-25T16:00');
    await hikeDao.complete(db, doneOld.id, '2026-11-20T15:00:00.000Z');
    await hikeDao.complete(db, doneRecent.id, '2026-11-25T15:00:00.000Z');
    await hike(otherId, '2026-11-28T09:00', '2026-11-28T17:00');

    const ids = (await hikeDao.findByHiker(db, hikerId)).map(({ id }) => id);
    expect(ids).toEqual([sooner.id, later.id, doneRecent.id, doneOld.id]);
    await expect(hikeDao.findByHiker(db, -1)).resolves.toEqual([]);
  });

  it('findActive lists the started, not completed hikes with the hiker, earliest expected return first', async () => {
    const hikerId = await insertUser(db, { email: 'hike-active@example.com', firstName: 'Luca' });
    await db.run('UPDATE users SET phone = ?, notes = ?, emergency_contact = ? WHERE id = ?', [
      '+39 333 1234567',
      'Guide',
      'Maria Verdi',
      hikerId,
    ]);
    const now = '2026-11-28T10:00';
    const onTheWay = await hike(hikerId, '2026-11-28T08:00', '2026-11-28T16:00');
    const overdue = await hike(hikerId, '2026-11-27T08:00', '2026-11-27T16:00'); // still active after its return
    const leavingNow = await hike(hikerId, now, '2026-11-28T18:00'); // the departure minute counts
    await hike(hikerId, '2026-11-28T10:01', '2026-11-28T18:00'); // not started yet
    const done = await hike(hikerId, '2026-11-28T07:00', '2026-11-28T09:00');
    await hikeDao.complete(db, done.id, '2026-11-28T08:55:00.000Z');

    const active = await hikeDao.findActive(db, now);

    expect(active.map(({ id }) => id)).toEqual([overdue.id, onTheWay.id, leavingNow.id]);
    expect(active[1]).toEqual({
      ...onTheWay,
      hiker: {
        id: hikerId,
        firstName: 'Luca',
        lastName: 'Jornet',
        email: 'hike-active@example.com',
        phone: '+39 333 1234567',
        notes: 'Guide',
        emergencyContact: 'Maria Verdi',
      },
    });
  });

  it('complete sets completedAt only the first time; false for a completed or unknown hike', async () => {
    const hikerId = await insertUser(db, { email: 'hike-complete@example.com' });
    const { id } = await hike(hikerId, '2026-11-28T08:00', '2026-11-28T16:00');

    await expect(hikeDao.complete(db, id, '2026-11-28T15:00:00.000Z')).resolves.toBe(true);
    await expect(hikeDao.complete(db, id, '2026-11-28T17:00:00.000Z')).resolves.toBe(false);
    await expect(hikeDao.complete(db, -1, '2026-11-28T17:00:00.000Z')).resolves.toBe(false);
    await expect(hikeDao.findById(db, id)).resolves.toMatchObject({ completedAt: '2026-11-28T15:00:00.000Z' });
  });
});
