import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '../../src/dao/bookingDao.js';
import { getDb } from '../../src/dao/db.js';
import { seed, FIRST_DAY, LAST_DAY, USERS, BOOKINGS } from '../../src/seed.js';
import { now } from '../../src/clock.js';
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

    // Demo accounts must be complete, use valid roles, and have unique emails.
    expect(users).toHaveLength(USERS.length);
    expect(new Set(users.map(({ email }) => email.toLowerCase())).size).toBe(users.length);
    expect(users.every(({ email, passwordHash, role }) =>
      email && passwordHash && ['hiker', 'employee', 'warden'].includes(role),
    )).toBe(true);

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
  });
});
