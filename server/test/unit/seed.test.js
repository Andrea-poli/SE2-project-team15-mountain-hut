import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '../../src/dao/bookingDao.js';
import { getDb } from '../../src/dao/db.js';
import * as hikeDao from '../../src/dao/hikeDao.js';
import * as slotDao from '../../src/dao/slotDao.js';
import { seed, FIRST_DAY, LAST_DAY, USERS, BOOKINGS, MENUS, HIKES } from '../../src/seed.js';
import { now, setNow } from '../../src/clock.js';
import { useFixedClock } from '../helpers/fixedClock.js';

useFixedClock('2026-11-02T10:00');

describe('demo data seed', () => {
  it('generates demo data that respects slot and booking constraints', async () => {
    const db = await getDb();
    const today = now();

    const result = await seed(db, today);

    // Read the generated rows with their linked tables so constraints can be checked across records.
    const slots = await db.all(
      `SELECT s.id, s.date, s.start_time AS startTime, s.end_time AS endTime, s.label, s.status,
              t.id AS tableId, t.name AS tableName, t.seats AS capacity
       FROM slots s JOIN slot_tables t ON t.slot_id = s.id
       ORDER BY s.date, s.start_time, t.id`,
    );
    const users = await db.all('SELECT id, email, password_hash AS passwordHash, role FROM users');
    const bookingRows = await db.all(
      `SELECT b.id, b.slot_id AS slotId, b.hiker_id AS hikerId, u.role AS hikerRole,
              b.party_size AS partySize, b.status, b.created_at AS createdAt,
              s.date, s.start_time AS startTime, t.slot_id AS tableSlotId,
              t.id AS tableId, t.seats AS capacity, bt.seats AS assignedSeats
       FROM bookings b
       JOIN users u ON u.id = b.hiker_id
       JOIN slots s ON s.id = b.slot_id
       JOIN booking_tables bt ON bt.booking_id = b.id
       JOIN slot_tables t ON t.id = bt.slot_table_id
       ORDER BY b.id, t.id`,
    );

    expect(result.users).toBe(USERS.length);
    expect(result.bookings).toBe(BOOKINGS.length);

    // Demo accounts use valid roles and unique emails; everyone can log in except the temporary hiker (MH-07),
    // a hiker entered by staff with no email and no password.
    expect(users).toHaveLength(USERS.length);
    const withEmail = users.filter(({ email }) => email);
    expect(new Set(withEmail.map(({ email }) => email.toLowerCase())).size).toBe(withEmail.length);
    expect(users.every(({ role }) => ['hiker', 'employee', 'warden'].includes(role))).toBe(true);
    const temporary = users.filter(({ email, passwordHash }) => !email && !passwordHash);
    expect(temporary.map(({ role }) => role)).toEqual(['hiker']);
    expect(users.every((user) => temporary.includes(user) || (user.email && user.passwordHash))).toBe(true);

    // Check each slot's tables and basic fields, then verify daily timing and Saturday-only slots.
    const slotsByDate = new Map();
    const tablesBySlot = new Map();
    for (const slot of slots) {
      if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, new Map());
      slotsByDate.get(slot.date).set(slot.startTime, slot);
      if (!tablesBySlot.has(slot.id)) tablesBySlot.set(slot.id, new Map());
      const tables = tablesBySlot.get(slot.id);
      expect(tables.has(slot.tableName)).toBe(false);
      expect(slot.capacity).toBeGreaterThan(0);
      tables.set(slot.tableName, slot.capacity);
      expect(slot.status).toBe('open');
      expect(slot.label.trim()).not.toBe('');
      expect(slot.endTime > slot.startTime).toBe(true);
    }

    const expectedDates = Array.from({ length: LAST_DAY - FIRST_DAY + 1 }, (_, index) =>
      new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + FIRST_DAY + index),
      )
        .toISOString()
        .slice(0, 10),
    );
    expect(result.from).toBe(expectedDates[0]);
    expect(result.to).toBe(expectedDates[expectedDates.length - 1]);
    expect([...slotsByDate.keys()]).toEqual(expectedDates);
    const saturdayCount = expectedDates.filter((date) => new Date(`${date}T12:00`).getDay() === 6).length;
    expect(result.slots).toBe(expectedDates.length * 2 + saturdayCount);
    expect(tablesBySlot.size).toBe(result.slots);
    for (const [date, byStartTime] of slotsByDate) {
      const daySlots = [...byStartTime.values()];
      expect(daySlots.some(({ startTime, endTime }) => startTime === '12:00' && endTime === '14:00')).toBe(true);
      expect(daySlots.some(({ startTime, endTime }) => startTime === '19:00' && endTime === '20:30')).toBe(true);
      const secondDinner = daySlots.find(({ startTime }) => startTime === '20:30');
      const isSaturday = new Date(`${date}T12:00`).getDay() === 6;
      expect(Boolean(secondDinner)).toBe(isSaturday);
      if (secondDinner) {
        expect(secondDinner.endTime).toBe('22:00');
      }

      daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let index = 1; index < daySlots.length; index++) {
        expect(daySlots[index - 1].endTime <= daySlots[index].startTime).toBe(true);
      }
    }

    // Group table assignments by booking to validate ownership, party sizes, and aggregate capacity.
    const bookings = new Map();
    const confirmedSeats = new Map();
    for (const row of bookingRows) {
      if (!bookings.has(row.id)) {
        bookings.set(row.id, { ...row, tables: [] });
      }
      const booking = bookings.get(row.id);
      booking.tables.push(row);

      expect(row.hikerRole).toBe('hiker');
      expect([BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED]).toContain(row.status);
      expect(row.tableSlotId).toBe(row.slotId);
      expect(row.assignedSeats).toBeGreaterThan(0);
      expect(row.assignedSeats).toBeLessThanOrEqual(row.capacity);
      expect(new Date(row.createdAt).getTime()).toBeLessThan(
        new Date(`${row.date}T${row.startTime}:00`).getTime(),
      );

      if (row.status === BOOKING_STATUS.CONFIRMED) {
        const key = `${row.slotId}/${row.tableId}`;
        confirmedSeats.set(key, (confirmedSeats.get(key) ?? 0) + row.assignedSeats);
      }
    }

    expect(bookings.size).toBe(BOOKINGS.length);
    const confirmedHikerSlots = [...bookings.values()].filter(
      ({ status }) => status === BOOKING_STATUS.CONFIRMED,
    );
    const uniqueConfirmedHikerSlots = new Set(
      confirmedHikerSlots.map(({ slotId, hikerId }) => `${slotId}/${hikerId}`),
    );
    expect(uniqueConfirmedHikerSlots.size).toBe(confirmedHikerSlots.length);

    for (const booking of bookings.values()) {
      expect(booking.partySize).toBeGreaterThan(0);
      expect(booking.tables.reduce((total, { assignedSeats }) => total + assignedSeats, 0)).toBe(booking.partySize);
    }
    for (const [key, seats] of confirmedSeats) {
      const [slotId, tableId] = key.split('/').map(Number);
      const capacity = slots.find((slot) => slot.id === slotId && slot.tableId === tableId).capacity;
      expect(seats).toBeLessThanOrEqual(capacity);
    }

    // Party requirements (MH-05) are saved with their bookings, in the order of the seed.
    const saved = await db.all(
      `SELECT b.party_size AS partySize, r.has_allergies AS hasAllergies, r.description
       FROM booking_requirements r JOIN bookings b ON b.id = r.booking_id ORDER BY r.booking_id, r.id`,
    );
    const expected = BOOKINGS.flatMap(({ partySize, requirements = [] }) =>
      requirements.map((r) => ({ partySize, hasAllergies: Number(r.hasAllergies), description: r.description })));
    expect(saved).toEqual(expected);
    expect(saved.some(({ hasAllergies }) => hasAllergies)).toBe(true);
    expect(saved.some(({ hasAllergies }) => !hasAllergies)).toBe(true);
  });
});

// U3 (sprint 3) – menus (MH-10, MH-11) and hikes (MH-20, MH-21, MH-22) of the demo data.
describe('demo data seed – menus and hikes', () => {
  /** 'YYYY-MM-DD' in hut local time, `days` from the fixed day (same counting as the seed). */
  const dayFrom = (today, days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('puts the menus on their slots only, with past and future menus, and none tomorrow and from day 4', async () => {
    const db = await getDb();
    const today = now();
    const result = await seed(db, today);

    const withMenu = await db.all(
      "SELECT date, start_time AS startTime, menu FROM slots WHERE menu IS NOT NULL ORDER BY date, start_time",
    );
    expect(result.menus).toBe(Object.keys(MENUS).length);
    expect(withMenu).toHaveLength(Object.keys(MENUS).length);
    const startOf = { lunch: '12:00', dinner1: '19:00' };
    const expected = Object.entries(MENUS)
      .map(([key, menu]) => {
        const [day, slot] = key.split('/');
        return { date: dayFrom(today, Number(day)), startTime: startOf[slot], menu };
      })
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    expect(withMenu).toEqual(expected);

    // Past menus (fixed, PO #59) and future ones; tomorrow and days 4–14 are left without a menu.
    const dates = withMenu.map(({ date }) => date);
    expect(dates.some((date) => date < dayFrom(today, 0))).toBe(true);
    expect(dates.some((date) => date > dayFrom(today, 0))).toBe(true);
    expect(dates).not.toContain(dayFrom(today, 1));
    expect(dates.every((date) => date < dayFrom(today, 4))).toBe(true);
    // Every menu uses the formatting of the contract, and "previous menus" lists each text once.
    expect(withMenu.every(({ menu }) => menu.includes('**') && menu.includes('\n- '))).toBe(true);
    expect(withMenu.some(({ menu }) => menu.includes('\n  - '))).toBe(true);
    const previous = await slotDao.findPreviousMenus(db);
    expect(previous.map(({ menu }) => menu).sort()).toEqual([...new Set(Object.values(MENUS))].sort());
  });

  it('saves the hikes with active, overdue, planned, cancelled and completed cases for the demo', async () => {
    const db = await getDb();
    const today = now(); // 2026-11-02T10:00, a quarter hour: the hike times are exact hours from it
    const result = await seed(db, today);

    const hikes = await db.all(
      `SELECT h.id, u.email, u.role, h.destination, h.route, h.passage_points AS passagePoints,
              h.departure_at AS departureAt, h.expected_return_at AS expectedReturnAt,
              h.completed_at AS completedAt, h.created_at AS createdAt
       FROM hikes h JOIN users u ON u.id = h.hiker_id ORDER BY h.id`,
    );
    expect(result.hikes).toBe(HIKES.length);
    expect(hikes).toHaveLength(HIKES.length);
    const local = (value) => new Date(value).getTime(); // 'YYYY-MM-DDTHH:MM' is read in local time
    for (const hike of hikes) {
      expect(hike.role).toBe('hiker');
      expect(hike.email).toBeTruthy(); // a hiker who can log in to see and complete the hike
      expect(local(hike.expectedReturnAt)).toBeGreaterThan(local(hike.departureAt));
      const registered = new Date(hike.createdAt).getTime();
      expect(registered).toBeLessThanOrEqual(Math.min(today.getTime(), local(hike.departureAt)));
      if (hike.completedAt) expect(new Date(hike.completedAt).getTime()).toBeLessThanOrEqual(today.getTime());
    }

    const nowLocal = '2026-11-02T10:00';
    const active = await hikeDao.findActive(db, nowLocal);
    expect(active.map(({ hiker, expectedReturnAt }) => [hiker.email, expectedReturnAt])).toEqual([
      ['luca.verdi@example.com', '2026-11-02T09:00'], // overdue: back 1 h ago, still active
      ['hiker@example.com', '2026-11-02T14:00'],
      ['anna.bianchi@example.com', '2026-11-03T17:00'], // back tomorrow
    ]);
    expect(active.find(({ hiker }) => hiker.email === 'hiker@example.com').hiker).toMatchObject({
      notes: expect.any(String),
      emergencyContact: expect.any(String),
    });

    // Hannah (hiker@example.com) has every case of "My hikes": planned, in progress, cancelled, completed.
    const kind = (hike) => {
      if (!hike.completedAt) return hike.departureAt <= nowLocal ? 'inProgress' : 'planned';
      return local(hike.departureAt) > new Date(hike.completedAt).getTime() ? 'cancelled' : 'completed';
    };
    const hannah = hikes.filter(({ email }) => email === 'hiker@example.com').map(kind).sort();
    expect(hannah).toEqual(['cancelled', 'completed', 'inProgress', 'planned']);
    expect(hikes.some(({ passagePoints }) => passagePoints === null)).toBe(true);
    expect(hikes.some(({ passagePoints }) => passagePoints !== null)).toBe(true);
  });

  it('rounds the hike times to the quarter hour: seeding at 23:52 gives the same cases across midnight', async () => {
    setNow('2026-11-02T23:52');
    const db = await getDb();
    await seed(db, now());

    const active = await hikeDao.findActive(db, '2026-11-02T23:52');
    expect(active.map(({ departureAt, expectedReturnAt }) => [departureAt, expectedReturnAt])).toEqual([
      ['2026-11-02T17:45', '2026-11-02T22:45'],
      ['2026-11-02T21:45', '2026-11-03T03:45'],
      ['2026-11-02T20:45', '2026-11-04T06:45'],
    ]);
    const planned = await db.all(
      "SELECT departure_at AS d FROM hikes WHERE completed_at IS NULL AND departure_at > '2026-11-02T23:52'",
    );
    expect(planned).toEqual([{ d: '2026-11-03T21:45' }]);
  });
});
