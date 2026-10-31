// Demo data (U10), to develop and try the app: `npm run seed` from the repository root.
// It REPLACES every user, slot and booking of the database in DB_PATH / DATA_DIR and logs everybody out.
// Never used by the tests: they start from their own empty temporary database (planning DoD).
//
// Dates are relative to today (now() of clock.js, so FAKE_NOW moves them too): slots from 7 days ago
// to 14 days ahead, so there are always past days, today and future days to look at.
// Demo accounts and passwords: README, "Demo accounts" (same accounts as the client mocks, api/mocks/auth.js).
// More demo cases (full slot, almost full, slot closing within 2 h…) come with C3.
import { existsSync } from 'node:fs';
import sqlite3 from 'sqlite3';
import { now } from './clock.js';
import { config } from './config.js';
import * as bookingDao from './dao/bookingDao.js';
import { closeDb, getDb } from './dao/db.js';
import * as slotDao from './dao/slotDao.js';
import { withTransaction } from './dao/transaction.js';
import * as userDao from './dao/userDao.js';
import { hashPassword } from './services/authService.js';

const FIRST_DAY = -7; // one week ago
const LAST_DAY = 14; // two weeks ahead

// key: used by BOOKINGS below. Phones in E.164, as the registration saves them.
const USERS = [
  { key: 'hannah', firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', password: 'hikerpass', phone: '+393331111111', notes: 'Registered mountain guide', emergencyContact: 'Paul Hiker +393331112222', role: 'hiker' },
  { key: 'eric', firstName: 'Eric', lastName: 'Employee', email: 'employee@example.com', password: 'employeepass', role: 'employee' },
  { key: 'wendy', firstName: 'Wendy', lastName: 'Warden', email: 'warden@example.com', password: 'wardenpass', phone: '+393333333333', role: 'warden' },
  // Other hikers, so a slot can hold bookings of different people (one booking per hiker per slot).
  { key: 'marco', firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com', password: 'hikerpass', phone: '+393401234567', role: 'hiker' },
  { key: 'anna', firstName: 'Anna', lastName: 'Bianchi', email: 'anna.bianchi@example.com', password: 'hikerpass', phone: '+393471234567', role: 'hiker' },
  { key: 'luca', firstName: 'Luca', lastName: 'Verdi', email: 'luca.verdi@example.com', password: 'hikerpass', phone: '+41791234567', role: 'hiker' },
];

// Lunch and dinner have different tables on purpose: there is no fixed table set (MH-02).
const LUNCH_TABLES = [
  { name: 'T1', seats: 4 },
  { name: 'T2', seats: 4 },
  { name: 'T3', seats: 4 },
  { name: 'T4', seats: 6 },
  { name: 'T5', seats: 8 },
];
const DINNER_TABLES = [
  { name: 'T1', seats: 2 },
  { name: 'T2', seats: 4 },
  { name: 'T3', seats: 4 },
  { name: 'T4', seats: 6 },
  { name: 'T5', seats: 8 },
];

// key: day of the slot (0 = today) + slot key, used by BOOKINGS. The second dinner turn starts when the
// first one ends (adjacent turns are allowed, MH-02) and exists only on Saturdays.
const SLOT_TYPES = [
  { key: 'lunch', label: 'Lunch', startTime: '12:00', endTime: '14:00', tables: LUNCH_TABLES },
  { key: 'dinner1', label: 'Dinner – 1st turn', startTime: '19:00', endTime: '20:30', tables: DINNER_TABLES },
  { key: 'dinner2', label: 'Dinner – 2nd turn', startTime: '20:30', endTime: '22:00', tables: DINNER_TABLES, saturdayOnly: true },
];
const SATURDAY = 6;

// A few bookings. Tables follow the allocation rule (planning 4.3 B: fewest tables, then fewest seats
// left over, then lowest ids), taking into account the bookings listed before them in the same slot.
// createdDaysAgo: when the booking was made, before its slot.
const BOOKINGS = [
  // Past days: the week view shows them greyed out with their bookings.
  { day: -3, slot: 'dinner1', hiker: 'marco', partySize: 4, tables: { T2: 4 }, createdDaysAgo: 6 },
  { day: -3, slot: 'dinner1', hiker: 'hannah', partySize: 6, tables: { T4: 6 }, createdDaysAgo: 5 },
  { day: -3, slot: 'dinner1', hiker: 'anna', partySize: 2, tables: { T1: 2 }, createdDaysAgo: 4 },
  { day: -1, slot: 'lunch', hiker: 'luca', partySize: 3, tables: { T1: 3 }, createdDaysAgo: 2 },
  // Today.
  { day: 0, slot: 'lunch', hiker: 'hannah', partySize: 3, tables: { T1: 3 }, createdDaysAgo: 1 },
  { day: 0, slot: 'lunch', hiker: 'marco', partySize: 8, tables: { T5: 8 }, createdDaysAgo: 1 },
  // Tomorrow: a party of 10 split over two tables ("2 + 8" seats), then a party of 2 at a table of 4.
  { day: 1, slot: 'dinner1', hiker: 'anna', partySize: 10, tables: { T1: 2, T5: 8 }, createdDaysAgo: 2 },
  { day: 1, slot: 'dinner1', hiker: 'hannah', partySize: 2, tables: { T2: 2 }, createdDaysAgo: 1 },
  { day: 2, slot: 'lunch', hiker: 'luca', partySize: 5, tables: { T4: 5 }, createdDaysAgo: 1 },
  // A cancelled booking does not take seats: T1 is free again for the next one.
  { day: 3, slot: 'lunch', hiker: 'anna', partySize: 4, tables: { T1: 4 }, createdDaysAgo: 3, status: bookingDao.BOOKING_STATUS.CANCELLED },
  { day: 3, slot: 'lunch', hiker: 'marco', partySize: 4, tables: { T1: 4 }, createdDaysAgo: 1 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' of `date` + `days`, in hut local time (TZ, set by config.js). */
function localDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days); // calendar days: a DST change does not move the date
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Slots of every day from FIRST_DAY to LAST_DAY, with the day offset they belong to. */
function demoSlots(today) {
  const slots = [];
  for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
    const date = localDate(today, day);
    const isSaturday = new Date(`${date}T12:00`).getDay() === SATURDAY;
    for (const { key, saturdayOnly, ...slot } of SLOT_TYPES) {
      if (!saturdayOnly || isSaturday) slots.push({ day, key, date, ...slot });
    }
  }
  return slots;
}

/** Deletes every row, in the order the foreign keys allow (RESTRICT: bookings before slots and users). */
async function deleteAll(db) {
  for (const table of ['booking_tables', 'bookings', 'slot_tables', 'slots', 'users']) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/**
 * Replaces users, slots and bookings with the demo data. Passwords are hashed before the transaction
 * (scrypt is slow); everything else is written in one transaction: all of it or nothing.
 * @param {Date} today now() of clock.js: the day the demo dates start from, and the time bookings were made before
 */
async function seed(db, today) {
  // One hash per user, never shared: each has its own random salt, even with the same demo password.
  const hashes = new Map();
  for (const { key, password } of USERS) hashes.set(key, await hashPassword(password));

  return withTransaction(db, async () => {
    await deleteAll(db);

    const users = new Map();
    for (const { key, password: _password, ...user } of USERS) {
      users.set(key, await userDao.create(db, { ...user, passwordHash: hashes.get(key) }));
    }

    const slots = new Map();
    for (const { day, key, ...slot } of demoSlots(today)) {
      slots.set(`${day}/${key}`, await slotDao.create(db, slot));
    }

    for (const booking of BOOKINGS) {
      const slot = slots.get(`${booking.day}/${booking.slot}`);
      const tableId = (name) => slot.tables.find((table) => table.name === name).id;
      await bookingDao.create(db, {
        slotId: slot.id,
        hikerId: users.get(booking.hiker).id,
        partySize: booking.partySize,
        status: booking.status,
        createdAt: new Date(today.getTime() - booking.createdDaysAgo * DAY_MS).toISOString(),
        tables: Object.entries(booking.tables).map(([name, seats]) => ({ slotTableId: tableId(name), seats })),
      });
    }

    return {
      users: users.size,
      slots: slots.size,
      bookings: BOOKINGS.length,
      from: localDate(today, FIRST_DAY),
      to: localDate(today, LAST_DAY),
    };
  });
}

/**
 * Logs everybody out: after the seed the user ids start again from 1, so an old session could
 * point to another user. Does nothing when sessions.db does not exist yet (server never started).
 */
function deleteSessions(file) {
  if (!existsSync(file)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sessions = new sqlite3.Database(file, (err) => err && reject(err));
    sessions.serialize(() => {
      sessions.run('PRAGMA busy_timeout = 5000');
      sessions.run('DELETE FROM sessions', (err) => {
        sessions.close();
        // No table yet: nobody has ever logged in.
        if (err && !/no such table/.test(err.message)) reject(err);
        else resolve();
      });
    });
  });
}

if (config.env === 'production') {
  console.error('The seed deletes every user, slot and booking: it never runs when NODE_ENV is production.');
  process.exit(1);
}

try {
  const summary = await seed(await getDb(), now());
  await deleteSessions(config.sessionsDbPath);
  console.log(
    `Demo data ready in ${config.dbPath}: ${summary.users} users, ${summary.slots} slots ` +
      `(${summary.from} → ${summary.to}), ${summary.bookings} bookings. Everybody has been logged out.`,
  );
} catch (err) {
  console.error('Seed failed, the database is unchanged:', err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
