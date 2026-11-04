// Demo data (U10), to develop and try the app. Run with `npm run seed` from the repository root (seedCli.js):
// it REPLACES every user, slot and booking of the database in DB_PATH / DATA_DIR and logs everybody out.
// This module only exports the data and seed(db, today): importing it changes nothing, so a test can run
// seed() on its own temporary database with a fixed day. The other tests never rely on these data.
//
// Dates are relative to today (now() of clock.js, so FAKE_NOW moves them too): slots from 7 days ago
// to 14 days ahead, so there are always past days, today and future days to look at.
// Demo accounts and passwords: README, "Demo accounts" (same accounts as the client mocks, api/mocks/auth.js).
// Demo cases (C3), where to find them – the E2E tests also start from these data (server/src/index.js):
//   split party "2 + 8 seats": tomorrow's dinner · almost full (1 seat left): tomorrow's lunch ·
//   full: the dinner in 3 days · busy past days: 3, 2 and 1 days ago · cancelled booking: lunch in 3 days ·
//   closing within 2 h: today's lunch, with FAKE_NOW=<today>T10:30 (README, Demo accounts).
// The E2E specs rely on some days: keep tomorrow's dinner at 12 free seats (MH-04), today's and day 2's
// slots as they are (MH-02), and days 4–14 without bookings (MH-01). Run npm run test:e2e after any change.
import * as bookingDao from './dao/bookingDao.js';
import * as slotDao from './dao/slotDao.js';
import { withTransaction } from './dao/transaction.js';
import * as userDao from './dao/userDao.js';
import { hashPassword } from './services/authService.js';

export const FIRST_DAY = -7; // one week ago
export const LAST_DAY = 14; // two weeks ahead

// key: used by BOOKINGS below. Phones in E.164, as the registration saves them.
export const USERS = [
  { key: 'hannah', firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', password: 'hikerpass', phone: '+393331111111', notes: 'Registered mountain guide', emergencyContact: 'Paul Hiker +393331112222', role: 'hiker' },
  { key: 'eric', firstName: 'Eric', lastName: 'Employee', email: 'employee@example.com', password: 'employeepass', role: 'employee' },
  { key: 'wendy', firstName: 'Wendy', lastName: 'Warden', email: 'warden@example.com', password: 'wardenpass', phone: '+393333333333', role: 'warden' },
  // Other hikers, so a slot can hold bookings of different people (one booking per hiker per slot).
  { key: 'marco', firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com', password: 'hikerpass', phone: '+393401234567', role: 'hiker' },
  { key: 'anna', firstName: 'Anna', lastName: 'Bianchi', email: 'anna.bianchi@example.com', password: 'hikerpass', phone: '+393471234567', role: 'hiker' },
  { key: 'luca', firstName: 'Luca', lastName: 'Verdi', email: 'luca.verdi@example.com', password: 'hikerpass', phone: '+41791234567', role: 'hiker' },
];

// Lunch and dinner have different tables on purpose: there is no fixed table set (MH-02).
export const LUNCH_TABLES = [
  { name: 'T1', seats: 4 },
  { name: 'T2', seats: 4 },
  { name: 'T3', seats: 4 },
  { name: 'T4', seats: 6 },
  { name: 'T5', seats: 8 },
];
export const DINNER_TABLES = [
  { name: 'T1', seats: 2 },
  { name: 'T2', seats: 4 },
  { name: 'T3', seats: 4 },
  { name: 'T4', seats: 6 },
  { name: 'T5', seats: 8 },
];

// key: day of the slot (0 = today) + slot key, used by BOOKINGS. The second dinner turn starts when the
// first one ends (adjacent turns are allowed, MH-02) and exists only on Saturdays.
export const SLOT_TYPES = [
  { key: 'lunch', label: 'Lunch', startTime: '12:00', endTime: '14:00', tables: LUNCH_TABLES },
  { key: 'dinner1', label: 'Dinner – 1st turn', startTime: '19:00', endTime: '20:30', tables: DINNER_TABLES },
  { key: 'dinner2', label: 'Dinner – 2nd turn', startTime: '20:30', endTime: '22:00', tables: DINNER_TABLES, saturdayOnly: true },
];
const SATURDAY = 6;

// A few bookings. Tables follow the allocation rule (planning 4.3 B: fewest tables, then fewest seats
// left over, then lowest ids), taking into account the bookings listed before them in the same slot.
// createdDaysAgo: when the booking was made, before its slot.
export const BOOKINGS = [
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
  // C3 – tomorrow's lunch almost full: 25 of 26 seats, 1 left.
  { day: 1, slot: 'lunch', hiker: 'marco', partySize: 8, tables: { T5: 8 }, createdDaysAgo: 2 },
  { day: 1, slot: 'lunch', hiker: 'hannah', partySize: 6, tables: { T4: 6 }, createdDaysAgo: 2 },
  { day: 1, slot: 'lunch', hiker: 'anna', partySize: 4, tables: { T1: 4 }, createdDaysAgo: 1 },
  { day: 1, slot: 'lunch', hiker: 'luca', partySize: 7, tables: { T2: 4, T3: 3 }, createdDaysAgo: 1 },
  // C3 – the dinner in 3 days full: 24 of 24 seats (Anna's 8 on the two 4s, T5 is already Marco's).
  { day: 3, slot: 'dinner1', hiker: 'marco', partySize: 8, tables: { T5: 8 }, createdDaysAgo: 2 },
  { day: 3, slot: 'dinner1', hiker: 'hannah', partySize: 6, tables: { T4: 6 }, createdDaysAgo: 2 },
  { day: 3, slot: 'dinner1', hiker: 'anna', partySize: 8, tables: { T2: 4, T3: 4 }, createdDaysAgo: 1 },
  { day: 3, slot: 'dinner1', hiker: 'luca', partySize: 2, tables: { T1: 2 }, createdDaysAgo: 1 },
  // C3 – busier past days.
  { day: -2, slot: 'lunch', hiker: 'anna', partySize: 6, tables: { T4: 6 }, createdDaysAgo: 4 },
  { day: -2, slot: 'dinner1', hiker: 'marco', partySize: 4, tables: { T2: 4 }, createdDaysAgo: 4 },
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
 * Does not touch the sessions (seedCli.js logs everybody out) and does not close the database.
 * @param {object} db connection from db.js
 * @param {Date} today now() of clock.js: the day the demo dates start from, and the time bookings were made before
 * @returns {Promise<{ users: number, slots: number, bookings: number, from: string, to: string }>}
 */
export async function seed(db, today) {
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
