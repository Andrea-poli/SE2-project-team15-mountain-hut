// Bookings of mock mode (VITE_USE_MOCKS=true), shared by the bookings and availability mocks, so both see the
// same data, demo bookings included, whichever is loaded first. Kept in sessionStorage: a page still finds a
// booking after a reload. Only imported by other mocks (dynamic imports in api/*.js).
// TODO: remove together with the bookings and availability mocks.
import { toIsoDate } from '../../utils/dates.js';

const STORAGE_KEY = 'mh-mock-bookings';
const DAY_MS = 24 * 60 * 60 * 1000;

// Every mock slot has these tables (like the seed of U10): 4 + 4 + 6 = 14 seats.
export const TABLES = [
  { id: 1, name: 'T1', seats: 4 },
  { id: 2, name: 'T2', seats: 4 },
  { id: 3, name: 'T3', seats: 6 },
];

const DEMO_HIKER_ID = 1; // hiker@example.com in mocks/auth.js
// Times of the publicSlots mock, by turn (slot id = YYYYMMDD * 10 + turn).
const TURNS = {
  1: { label: 'Lunch', startTime: '12:00', endTime: '14:00' },
  2: { label: 'Dinner - 1st turn', startTime: '19:00', endTime: '20:30' },
  3: { label: 'Dinner - 2nd turn', startTime: '21:00', endTime: '22:30' },
};

/** Local date `days` from today as YYYY-MM-DD; a Monday (no meal service) moves one day further from today. */
function serviceDay(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  if (date.getDay() === 1) date.setDate(date.getDate() + (days < 0 ? -1 : 1));
  return toIsoDate(date);
}

/** A demo booking of the demo hiker on `date`, turn 1–3, seats per table as [tableId, seats]. */
function demoBooking(id, date, turn, partySize, seats, extra = {}) {
  return {
    id,
    hikerId: DEMO_HIKER_ID,
    slot: { id: Number(date.replaceAll('-', '')) * 10 + turn, date, ...TURNS[turn] },
    partySize,
    tables: seats.map(([tableId, n]) => ({ slotTableId: tableId, tableName: TABLES[tableId - 1].name, seats: n })),
    requirements: [],
    status: 'confirmed',
    createdAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
    ...extra,
  };
}

// MH-06 demo data, dated from today: two changeable bookings, one less than 48 h away, one cancelled and
// ten past ones (one cancelled): 14 in all, so "My bookings" shows every case and its "Show more" button.
function demoBookings() {
  const cancelled = { status: 'cancelled', tables: [] };
  return [
    demoBooking(1, serviceDay(7), 1, 3, [[1, 3]], {
      requirements: [
        { hasAllergies: true, description: '1 shellfish allergy' },
        { hasAllergies: false, description: '2 vegetarians' },
      ],
    }),
    demoBooking(2, serviceDay(10), 3, 8, [[3, 6], [1, 2]]),
    demoBooking(3, serviceDay(1), 3, 2, [[1, 2]]),
    demoBooking(4, serviceDay(5), 1, 4, [], cancelled),
    demoBooking(5, serviceDay(-1), 1, 2, [[1, 2]]),
    demoBooking(6, serviceDay(-3), 3, 5, [[3, 5]], {
      requirements: [{ hasAllergies: true, description: '1 peanut allergy' }],
    }),
    demoBooking(7, serviceDay(-6), 1, 1, [[1, 1]]),
    demoBooking(8, serviceDay(-9), 2, 4, [[1, 4]], cancelled),
    demoBooking(9, serviceDay(-13), 1, 6, [[3, 6]]),
    demoBooking(10, serviceDay(-17), 3, 2, [[2, 2]]),
    demoBooking(11, serviceDay(-24), 1, 3, [[1, 3]]),
    demoBooking(12, serviceDay(-27), 3, 4, [[2, 4]]),
    demoBooking(13, serviceDay(-31), 1, 2, [[1, 2]]),
    demoBooking(14, serviceDay(-36), 3, 7, [[3, 6], [1, 1]]),
  ];
}

/** Every booking of mock mode, with hikerId. The first read of a session stores the demo bookings. */
export function loadBookings() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      const demo = demoBookings();
      saveBookings(demo);
      return demo;
    }
    return JSON.parse(stored) ?? [];
  } catch {
    return []; // storage unavailable: no bookings
  }
}

export function saveBookings(list) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // private mode: the bookings last until reload
  }
}
