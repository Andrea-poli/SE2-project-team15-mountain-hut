import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../src/dao/db.js';
import * as bookingDao from '../../../src/dao/bookingDao.js';
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
        tables: [{ id: tableId, name: 'A', seats: 4 }],
      },
      {
        id: laterSlotId,
        date: '2026-12-02',
        startTime: '18:00',
        endTime: '20:00',
        label: 'Dinner',
        status: 'open',
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
