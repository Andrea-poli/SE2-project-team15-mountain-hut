// Mock of the bookings endpoints (VITE_USE_MOCKS=true): same answers and errors as the contract,
// no server needed. Only loaded through a dynamic import in api/bookings.js.
// Slots come from the publicSlots mock, so the two always agree; the bookings are in bookingStore.js
// (shared with the availability mock).
// TODO: remove when MH-01 BE2 (POST/GET /api/bookings) is on dev, together with all mocks if the team drops mock mode.
import { ApiError } from '../client.js';
import { areRequirementsValid } from '../../utils/validation.js';
import { checkAvailability } from './availability.js';
import { loadBookings, saveBookings, TABLES } from './bookingStore.js';
import { listPublicSlots } from './publicSlots.js';

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

const CHANGE_WINDOW_MS = 48 * 60 * 60 * 1000; // changes close 48 h before the slot starts (MH-06, PO issue #43)

/** True when the hiker already has a confirmed booking for the slot, except `exceptId` (like the server). */
const hasConfirmedBooking = (bookings, hikerId, slotId, exceptId) =>
  bookings.some((b) => b.id !== exceptId && b.hikerId === hikerId && b.slot.id === slotId && b.status === 'confirmed');

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

export async function createBooking({ slotId, partySize, requirements = [] }) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (user.role !== 'hiker') throw new ApiError(403, 'Only hikers can book');
  if (!Number.isInteger(slotId) || slotId < 1 || !Number.isInteger(partySize) || partySize < 1) {
    throw new ApiError(400, 'slotId and partySize must be positive integers');
  }
  if (!areRequirementsValid(requirements)) {
    throw new ApiError(400, 'Each requirement needs hasAllergies (true or false) and a description');
  }
  const savedRequirements = requirements.map(({ hasAllergies, description }) => ({
    hasAllergies,
    description: description.trim(),
  }));

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

  const bookings = loadBookings();
  if (hasConfirmedBooking(bookings, user.id, slotId)) {
    throw new ApiError(409, 'You already have a booking for this slot');
  }
  const taken = (tableId) =>
    bookings
      .filter((b) => b.slot.id === slotId && b.status === 'confirmed') // cancelled seats are free (MH-08)
      .flatMap((b) => b.tables)
      .filter((t) => t.slotTableId === tableId)
      .reduce((sum, t) => sum + t.seats, 0);
  // A "full" slot of the mock has no free seat at all.
  const free = TABLES.map((t) => ({ ...t, free: slot.bookingState === 'full' ? 0 : t.seats - taken(t.id) }));
  const split = allocate(free, partySize);
  if (!split) throw new ApiError(409, 'Not enough seats available for this party');

  const booking = {
    id: bookings.reduce((max, b) => Math.max(max, b.id), 0) + 1,
    hikerId: user.id,
    slot: { id: slot.id, date, startTime: slot.startTime, endTime: slot.endTime, label: slot.label },
    partySize,
    tables: split.map(({ table, seats }) => ({ slotTableId: table.id, tableName: table.name, seats })),
    requirements: savedRequirements,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  saveBookings([...bookings, booking]);
  const { hikerId: _hikerId, ...publicBooking } = booking;
  return publicBooking;
}

export async function getBooking(id) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (!/^[1-9]\d*$/.test(String(id))) throw new ApiError(400, 'id must be a positive integer');
  const found = loadBookings().find((b) => b.id === Number(id) && b.hikerId === user.id);
  // Someone else's booking is "not found" too: its existence is not revealed (contract).
  if (!found) throw new ApiError(404, 'Booking not found');
  const { hikerId: _hikerId, ...publicBooking } = found;
  return publicBooking;
}

/** Start of a slot ({date, startTime}) in local time, as a timestamp. */
function slotStart({ date, startTime }) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

/** At least 48 h before `slot` starts, exactly 48 h included (PO, issue #43). */
const inChangeWindow = (slot, now) => slotStart(slot) - now >= CHANGE_WINDOW_MS;

// GET /api/bookings: upcoming bookings first (soonest first), then past ones (most recent first);
// a slot is past once its start is at or before now (contract, slot time rules).
export async function listMyBookings() {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (user.role !== 'hiker') throw new ApiError(403, 'Only hikers have bookings');
  const now = Date.now();
  const mine = loadBookings().filter((b) => b.hikerId === user.id);
  const isUpcoming = (b) => slotStart(b.slot) > now;
  const byStart = (a, b) => slotStart(a.slot) - slotStart(b.slot) || a.id - b.id;
  const upcoming = mine.filter(isUpcoming).sort(byStart);
  const past = mine.filter((b) => !isUpcoming(b)).sort((a, b) => byStart(b, a));
  return [...upcoming, ...past].map(({ hikerId: _hikerId, ...booking }) => ({
    ...booking,
    changeable: booking.status === 'confirmed' && inChangeWindow(booking.slot, now),
  }));
}

// PATCH /api/bookings/:id: same checks and messages as the contract. The change is a new booking in the
// (new) slot: this booking's own seats are free, the tables are assigned again, and on any error nothing changes.
export async function changeBooking(id, change = {}) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (!/^[1-9]\d*$/.test(String(id))) throw new ApiError(400, 'id must be a positive integer');
  const bookings = loadBookings();
  const booking = bookings.find((b) => b.id === Number(id) && b.hikerId === user.id);
  if (!booking) throw new ApiError(404, 'Booking not found'); // also someone else's, and staff

  const { slotId, partySize, requirements } = change;
  if (slotId === undefined && partySize === undefined && requirements === undefined) {
    throw new ApiError(400, 'Nothing to change');
  }
  if (slotId !== undefined && (!Number.isInteger(slotId) || slotId < 1)) {
    throw new ApiError(400, 'slotId must be a positive integer');
  }
  if (partySize !== undefined && (!Number.isInteger(partySize) || partySize < 1)) {
    throw new ApiError(400, 'partySize must be a positive integer');
  }
  if (requirements !== undefined && !areRequirementsValid(requirements)) {
    throw new ApiError(400, 'Each requirement needs hasAllergies (true or false) and a description');
  }
  if (booking.status === 'cancelled') throw new ApiError(400, 'A cancelled booking cannot be changed');
  const now = Date.now();
  if (!inChangeWindow(booking.slot, now)) {
    throw new ApiError(400, 'Bookings can be changed up to 48 hours before the slot starts');
  }

  let slot = booking.slot;
  if (slotId !== undefined && slotId !== booking.slot.id) {
    const date = dateOfSlot(slotId);
    let found;
    try {
      found = (await listPublicSlots(date)).find((s) => s.id === slotId);
    } catch {
      // not a mock date: unknown slot
    }
    if (!found) throw new ApiError(404, 'Slot not found');
    slot = { id: found.id, date, startTime: found.startTime, endTime: found.endTime, label: found.label };
    if (!inChangeWindow(slot, now)) throw new ApiError(400, 'The new slot must start at least 48 hours from now');
    if (hasConfirmedBooking(bookings, user.id, slotId, booking.id)) {
      throw new ApiError(409, 'You already have a booking for this slot');
    }
  }

  const newPartySize = partySize ?? booking.partySize;
  const seats = await checkAvailability(slot.id, newPartySize, { ignoreBookingId: booking.id });
  if (!seats.available) throw new ApiError(409, 'Not enough seats available for this party');

  const changed = {
    ...booking,
    slot,
    partySize: newPartySize,
    tables: seats.split,
    requirements:
      requirements === undefined
        ? booking.requirements
        : requirements.map(({ hasAllergies, description }) => ({ hasAllergies, description: description.trim() })),
  };
  // Read again: the availability check waited, and the list may have changed meanwhile.
  saveBookings(loadBookings().map((b) => (b.id === changed.id ? changed : b)));
  const { hikerId: _hikerId, ...publicBooking } = changed;
  return publicBooking;
}

// POST /api/bookings/:id/cancel (MH-08): owner only (404 otherwise), at any time (PO issue #8), 409 when already
// cancelled. The booking is kept with status cancelled and no tables, so its seats are free again (contract,
// Booking.tables "empty for a cancelled booking"). The mock sends no email.
export async function cancelBooking(id) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'You need to log in');
  if (!/^[1-9]\d*$/.test(String(id))) throw new ApiError(400, 'id must be a positive integer');
  const bookings = loadBookings();
  const booking = bookings.find((b) => b.id === Number(id) && b.hikerId === user.id);
  if (!booking) throw new ApiError(404, 'Booking not found'); // also someone else's, and staff
  if (booking.status === 'cancelled') throw new ApiError(409, 'This booking is already cancelled');

  const cancelled = { ...booking, status: 'cancelled', tables: [] };
  saveBookings(bookings.map((b) => (b.id === cancelled.id ? cancelled : b)));
  const { hikerId: _hikerId, ...publicBooking } = cancelled;
  return publicBooking;
}
