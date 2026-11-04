// Mock of GET /api/public/slots/:id/availability (VITE_USE_MOCKS=true): same answers and errors as the
// contract, no server needed. Only loaded through a dynamic import in api/availability.js.
// Slots come from the publicSlots mock and the seats taken from the bookings mock (sessionStorage),
// so the check, the time menu and a booking made in mock mode always agree.
// TODO: remove when MH-04 BE1 is on dev, together with all mocks if the team drops mock mode.
import { ApiError } from '../client.js';
import { listPublicSlots } from './publicSlots.js';

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

// Same tables as the bookings mock: 4 + 4 + 6 = 14 seats in every mock slot.
const TABLES = [
  { id: 1, name: 'T1', seats: 4 },
  { id: 2, name: 'T2', seats: 4 },
  { id: 3, name: 'T3', seats: 6 },
];
const NOT_AVAILABLE = { available: false, split: [] };

/** Mock slot id → date (the ids of the publicSlots mock are YYYYMMDD * 10 + turn). */
function dateOfSlot(slotId) {
  const text = String(Math.floor(slotId / 10));
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** Seats taken at a table of the slot by the bookings made in mock mode. */
function taken(slotId, tableId) {
  let bookings = [];
  try {
    bookings = JSON.parse(sessionStorage.getItem('mh-mock-bookings')) ?? [];
  } catch {
    // storage unavailable: no bookings
  }
  return bookings
    .filter((b) => b.slot.id === slotId)
    .flatMap((b) => b.tables)
    .filter((t) => t.slotTableId === tableId)
    .reduce((sum, t) => sum + t.seats, 0);
}

// One table if any has room (the one with the fewest free seats), otherwise the biggest tables first.
// Close enough to the real rule (server/src/services/availability.js) for a mock.
function allocate(free, partySize) {
  const single = free.filter((t) => t.free >= partySize).sort((a, b) => a.free - b.free)[0];
  if (single) return [{ table: single, seats: partySize }];
  const split = [];
  let left = partySize;
  for (const table of [...free].sort((a, b) => b.free - a.free)) {
    if (left === 0 || table.free === 0) continue;
    const seats = Math.min(table.free, left);
    split.push({ table, seats });
    left -= seats;
  }
  return left === 0 ? split : null;
}

export async function checkAvailability(slotId, partySize) {
  await wait();
  if (!Number.isInteger(slotId) || slotId < 1) throw new ApiError(400, 'id must be a positive integer');
  if (!Number.isInteger(partySize) || partySize < 1) throw new ApiError(400, 'partySize must be a positive integer');

  let slots;
  try {
    slots = await listPublicSlots(dateOfSlot(slotId));
  } catch {
    throw new ApiError(404, 'Slot not found');
  }
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new ApiError(404, 'Slot not found');
  if (slot.bookingState !== 'bookable') return NOT_AVAILABLE; // full, or less than 2 h before the start

  const free = TABLES.map((t) => ({ ...t, free: t.seats - taken(slotId, t.id) }));
  const split = allocate(free, partySize);
  if (!split) return NOT_AVAILABLE;
  return {
    available: true,
    split: split.map(({ table, seats }) => ({ slotTableId: table.id, tableName: table.name, seats })),
  };
}
