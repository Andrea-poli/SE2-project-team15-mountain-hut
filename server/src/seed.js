// Demo data (U10), to develop and try the app. Run with `npm run seed` from the repository root (seedCli.js):
// it REPLACES every user, slot, menu, booking and hike of the database in DB_PATH / DATA_DIR and logs everybody out.
// This module only exports the data and seed(db, today): importing it changes nothing, so a test can run
// seed() on its own temporary database with a fixed day. Unit and integration tests never rely on these data;
// the E2E server loads them at start (index.js), so the E2E tests do: changing them can break the E2E.
//
// Dates are relative to today (now() of clock.js, so FAKE_NOW moves them too): slots from 7 days ago
// to 14 days ahead, so there are always past days, today and future days to look at.
// Demo accounts and passwords: README, "Demo accounts" (same accounts as the client mocks, api/mocks/auth.js).
// Demo cases (C3), where to find them – the E2E tests also start from these data (server/src/index.js):
//   split party "2 + 8 seats": tomorrow's dinner · almost full (1 seat left): tomorrow's lunch ·
//   full: the dinner in 3 days · busy past days: 3, 2 and 1 days ago · cancelled booking: lunch in 3 days ·
//   closing within 2 h: today's lunch, with FAKE_NOW=<today>T10:30 (README, Demo accounts).
// Sprint 2 demo cases (U3), all on the lunch in 3 days (no E2E spec uses it):
//   requirements with allergies (MH-05, the PO example): luca · without allergies: anna (she rebooked
//   after cancelling, MH-08) · a temporary hiker booked by staff, no email, cannot log in (MH-07): giorgio.
// MH-06 48 h (hiker@example.com): the dinner in 3 days can be changed, tomorrow's dinner cannot.
// MH-09: copy this week onto the week after next, which has slots and never bookings, so its schedule is
// replaced. A week with bookings still to come is refused (PO #45): next week too, when the data is loaded
// Fri–Sun (the bookings of days 1–3 reach into it).
// The E2E specs rely on some days: keep tomorrow's dinner at 12 free seats (MH-04), today's and day 2's
// slots as they are (MH-02), and days 4–14 without bookings (MH-01). Run npm run test:e2e after any change.
// Sprint 3 demo cases (U3):
//   MH-10 menus: 3, 2 and 1 days ago, today and days 2–3 (past ones stay fixed, PO #59); "previous menus" lists
//   each text once (the fondue is on two past dinners). No menu tomorrow and from day 4: there a menu can be added,
//   and the meals page (MH-11) shows "no menu yet". Copy week does not copy menus (PO #55).
//   MH-20/21/22 hikes, in hours from now (rounded down to the quarter hour): active (Hannah, back in 4 h; Anna,
//   back tomorrow) and overdue (Luca, back 1 h ago) in the staff's Active hikes, earliest return first; Hannah
//   (hiker@example.com) also has a planned hike tomorrow (to complete = cancel, MH-22), a cancelled one and a
//   completed one; Marco has a completed one.
import * as bookingDao from './dao/bookingDao.js';
import * as hikeDao from './dao/hikeDao.js';
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
  // MH-07: temporary hiker (phone booking only, cannot log in: no email, no password).
  { key: 'giorgio', firstName: 'Giorgio', lastName: 'Montano', phone: '+393405556789', role: 'hiker' },
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
  // U3 – sprint 2 demo cases, on the lunch in 3 days (anna's cancelled C3 booking and marco's T1 are there).
  { day: 3, slot: 'lunch', hiker: 'luca', partySize: 4, tables: { T2: 4 }, createdDaysAgo: 2,
    requirements: [ // the PO example (MH-05, issue #29)
      { hasAllergies: true, description: '1 vegan, peanut allergy' },
      { hasAllergies: true, description: '1 shellfish allergy' },
      { hasAllergies: false, description: '2 vegetarians' },
    ] },
  { day: 3, slot: 'lunch', hiker: 'anna', partySize: 2, tables: { T3: 2 }, createdDaysAgo: 0,
    requirements: [{ hasAllergies: false, description: '1 vegetarian' }] },
  { day: 3, slot: 'lunch', hiker: 'giorgio', partySize: 3, tables: { T4: 3 }, createdDaysAgo: 0 },
];

// MH-10 menus, with the formatting of the contract (bold, italic, list items and sub-items). Each slot keeps its
// own copy of the text (PO #59): the same text on two slots is two copies.
const FONDUE = '**Fondue** of Valdostana fontina\n- Boiled potatoes\n  - with or without speck\n- *Blueberry tart*';
const PLIN = '**Plin** ravioli with butter and sage\n- Mixed salad\n- *Panna cotta*';
const POLENTA = '**Polenta concia** with Toma cheese\n- Barley soup\n  - vegetarian\n- *Apple strudel* with cream';
const TAGLIATELLE = '**Tagliatelle** with porcini mushrooms\n- Venison stew with polenta\n- *Bonet*';

// key: day of the slot + slot key, as in BOOKINGS. Tomorrow and days 4–14 have no menu on purpose (see above).
export const MENUS = {
  '-3/dinner1': FONDUE,
  '-2/lunch': PLIN,
  '-1/lunch': POLENTA,
  '-1/dinner1': FONDUE,
  '0/lunch': TAGLIATELLE,
  '2/lunch': PLIN,
  '2/dinner1': TAGLIATELLE,
  '3/dinner1': FONDUE,
};

// MH-20 hikes. Times are hours from now rounded down to the quarter hour (the E2E day, 10:00, stays 10:00), so the
// states never get old: departure in the past and not completed = active (MH-21), completedAt before the departure =
// cancelled (MH-22, PO #53). createdHoursAgo: when the hiker registered it (never after the departure).
export const HIKES = [
  // Active, in the staff's list in this order (earliest expected return first).
  { hiker: 'luca', destination: 'Monviso summit', route: 'normal route from Rifugio Quintino Sella',
    passagePoints: 'Rifugio Quintino Sella, Passo delle Sagnette',
    departure: -6, expectedReturn: -1, createdHoursAgo: 14 },
  { hiker: 'hannah', destination: 'Rifugio Quintino Sella', route: 'via the Chiaretto lake',
    passagePoints: 'Lago Chiaretto, Colle del Viso', departure: -2, expectedReturn: 4, createdHoursAgo: 20 },
  { hiker: 'anna', destination: 'Rifugio Vallanta', route: 'Giro del Monviso, first two stages',
    passagePoints: 'Passo San Chiaffredo, Passo di Vallanta', departure: -3, expectedReturn: 31, createdHoursAgo: 26 },
  // Hannah: planned tomorrow (not active yet), cancelled before it started, completed two days ago.
  { hiker: 'hannah', destination: 'Colle delle Traversette', route: 'via the Buco di Viso tunnel',
    passagePoints: 'Lago Chiaretto', departure: 22, expectedReturn: 30, createdHoursAgo: 2 },
  { hiker: 'hannah', destination: 'Punta Gastaldi', route: 'from Pian del Re via Lago Fiorenza',
    departure: 46, expectedReturn: 54, createdHoursAgo: 24, completed: -1 },
  { hiker: 'hannah', destination: 'Lago Grande di Viso', route: 'from Pian del Re',
    passagePoints: 'Lago Fiorenza, Lago Chiaretto',
    departure: -50, expectedReturn: -43, createdHoursAgo: 60, completed: -44 },
  // Marco: back safely yesterday, an hour before his expected return.
  { hiker: 'marco', destination: 'Lago Fiorenza', route: 'path from Pian del Re',
    departure: -26, expectedReturn: -18, createdHoursAgo: 30, completed: -19 },
];

const HOUR_MS = 60 * 60 * 1000;
const QUARTER_HOUR_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' of `date` + `days`, in hut local time (TZ, set by config.js). */
function localDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days); // calendar days: a DST change does not move the date
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DDTHH:MM' of `date`, in hut local time: the format of hikes in the contract. */
function localDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${localDate(date, 0)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The hikes of HIKES at `today` rounded down to the quarter hour, ready for hikeDao.create. */
function demoHikes(today, users) {
  const base = Math.floor(today.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  const at = (hours) => new Date(base + hours * HOUR_MS);
  return HIKES.map(({ hiker, destination, route, passagePoints = null, departure, expectedReturn, createdHoursAgo,
    completed }) => ({
    hike: {
      hikerId: users.get(hiker).id,
      destination,
      route,
      passagePoints,
      departureAt: localDateTime(at(departure)),
      expectedReturnAt: localDateTime(at(expectedReturn)),
      createdAt: at(-createdHoursAgo).toISOString(),
    },
    completedAt: completed === undefined ? null : at(completed).toISOString(),
  }));
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

/** Deletes every row, in the order the foreign keys allow (RESTRICT: bookings and hikes before slots and users). */
async function deleteAll(db) {
  const tables = ['booking_requirements', 'booking_tables', 'bookings', 'hikes', 'slot_tables', 'slots', 'users'];
  for (const table of tables) {
    await db.run(`DELETE FROM ${table}`);
  }
}

/**
 * Replaces users, slots, menus, bookings and hikes with the demo data. Passwords are hashed before the transaction
 * (scrypt is slow); everything else is written in one transaction: all of it or nothing.
 * Does not touch the sessions (seedCli.js logs everybody out) and does not close the database.
 * @param {object} db connection from db.js
 * @param {Date} today now() of clock.js: the day the demo dates start from, and the time bookings were made before
 * @returns {Promise<{ users: number, slots: number, menus: number, bookings: number, hikes: number, from: string,
 *   to: string }>}
 */
export async function seed(db, today) {
  // One hash per user, never shared: each has its own random salt, even with the same demo password.
  // A temporary hiker (MH-07) has no password, so nothing to hash.
  const hashes = new Map();
  for (const { key, password } of USERS) if (password) hashes.set(key, await hashPassword(password));

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
    for (const [key, menu] of Object.entries(MENUS)) await slotDao.setMenu(db, slots.get(key).id, menu); // MH-10

    for (const booking of BOOKINGS) {
      const slot = slots.get(`${booking.day}/${booking.slot}`);
      const tableId = (name) => slot.tables.find((table) => table.name === name).id;
      const newBooking = await bookingDao.create(db, {
        slotId: slot.id,
        hikerId: users.get(booking.hiker).id,
        partySize: booking.partySize,
        status: booking.status,
        createdAt: new Date(today.getTime() - booking.createdDaysAgo * DAY_MS).toISOString(),
        tables: Object.entries(booking.tables).map(([name, seats]) => ({ slotTableId: tableId(name), seats })),
      });
      if (booking.requirements) await bookingDao.saveRequirements(db, newBooking.id, booking.requirements); // MH-05
    }

    for (const { hike, completedAt } of demoHikes(today, users)) { // MH-20, MH-22
      const saved = await hikeDao.create(db, hike);
      if (completedAt) await hikeDao.complete(db, saved.id, completedAt);
    }

    return {
      users: users.size,
      slots: slots.size,
      menus: Object.keys(MENUS).length,
      bookings: BOOKINGS.length,
      hikes: HIKES.length,
      from: localDate(today, FIRST_DAY),
      to: localDate(today, LAST_DAY),
    };
  });
}
