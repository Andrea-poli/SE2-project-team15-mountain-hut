// Mock of the bookings endpoints (VITE_USE_MOCKS=true): same answers and errors as the contract,
// no server needed. Only loaded through a dynamic import in api/bookings.js.
// Slots come from the publicSlots mock, so the two always agree.
// TODO: remove when MH-01 BE2 (POST/GET /api/bookings) is on dev, together with all mocks if the team drops mock mode.
import { ApiError } from '../client.js';
import { listPublicSlots } from './publicSlots.js';

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

// Every mock slot has these tables (like the seed of U10): 4 + 4 + 6 = 14 seats.
const TABLES = [
  { id: 1, name: 'T1', seats: 4 },
  { id: 2, name: 'T2', seats: 4 },
  { id: 3, name: 'T3', seats: 6 },
];
const STORAGE_KEY = 'mh-mock-bookings';

// Kept in sessionStorage, so the confirmation page still finds the booking after a reload.
function load() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}
function save(list) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // private mode: the bookings last until reload
  }
}

/** Logged-in mock user (api/mocks/auth.js keeps it in sessionStorage). */
function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('mh-mock-user'));
  } catch {
    return null;
  }
}

/** Slot id → date (the mock ids are YYYYMMDD * 10 + turn). */
function dateOfSlot(slotId) {
  const day = Math.floor(slotId / 10);
  const text = String(day);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/**
 * Seat split for a party: one table if any fits (the smallest that fits), otherwise as few tables
 * as possible, largest first. Close enough to the real rule (planning 3.2) for a mock.
 */
function allocate(free, partySize) {
  const single = free.filter((t) => t.free >= partySize).sort((a, b) => a.free - b.free)[0];
  if (single) return [{ table: single, seats: partySize }];
  const result = [];
  let left = partySize;
  for (const table of [...free].sort((a, b) => b.free - a.free)) {
    if (left === 0) break;
    if (table.free === 0) continue;
    const seats = Math.min(table.free, left);
    result.push({ table, seats });
    left -= seats;
  }
  return left === 0 ? result : null;
}

export async function createBooking({ slotId, partySize }) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (user.role !== 'hiker') throw new ApiError(403, 'Only hikers can book');
  if (!Number.isInteger(slotId) || slotId < 1 || !Number.isInteger(partySize) || partySize < 1) {
    throw new ApiError(400, 'slotId and partySize must be positive integers');
  }

  const date = dateOfSlot(slotId);
  let slots;
  try {
    slots = await listPublicSlots(date);
  } catch {
    throw new ApiError(404, 'Slot not found');
  }
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new ApiError(404, 'Slot not found');
  if (slot.bookingState === 'tooLate') {
    throw new ApiError(400, 'Bookings are accepted up to 2 hours before the slot starts');
  }

  const bookings = load();
  if (bookings.some((b) => b.slot.id === slotId && b.hikerId === user.id)) {
    throw new ApiError(409, 'You already have a booking for this slot');
  }
  const taken = (tableId) =>
    bookings
      .filter((b) => b.slot.id === slotId)
      .flatMap((b) => b.tables)
      .filter((t) => t.slotTableId === tableId)
      .reduce((sum, t) => sum + t.seats, 0);
  // A "full" slot of the mock has no free seat at all.
  const free = TABLES.map((t) => ({ ...t, free: slot.bookingState === 'full' ? 0 : t.seats - taken(t.id) }));
  const split = allocate(free, partySize);
  if (!split) throw new ApiError(409, 'Not enough seats available for this party');

  const booking = {
    id: bookings.length + 1,
    hikerId: user.id,
    slot: { id: slot.id, date, startTime: slot.startTime, endTime: slot.endTime, label: slot.label },
    partySize,
    tables: split.map(({ table, seats }) => ({ slotTableId: table.id, tableName: table.name, seats })),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  save([...bookings, booking]);
  const { hikerId: _hikerId, ...publicBooking } = booking;
  return publicBooking;
}

export async function getBooking(id) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (!/^[1-9]\d*$/.test(String(id))) throw new ApiError(400, 'id must be a positive integer');
  const found = load().find((b) => b.id === Number(id) && b.hikerId === user.id);
  // Someone else's booking is "not found" too: its existence is not revealed (contract).
  if (!found) throw new ApiError(404, 'Booking not found');
  const { hikerId: _hikerId, ...publicBooking } = found;
  return publicBooking;
}
