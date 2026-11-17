// Mock of staff endpoints (MH-07): searchHikers and createStaffBooking.
// VITE_USE_MOCKS=true only. Same errors and contracts as openapi.yaml.
import { isValidPhoneNumber } from 'libphonenumber-js';
import { pickerSlotState } from '../../utils/slotPicker.js';
import { ApiError } from '../client.js';
import { listPublicSlots } from './publicSlots.js';

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

// Mock hikers: both regular and temporary, indexed by id.
// Regular hikers can log in; temporary hikers cannot (no email/password).
// Extended by createStaffBooking when newHiker or temporaryHiker is sent.
const hikers = [
  {
    id: 1,
    firstName: 'Hannah',
    lastName: 'Hiker',
    email: 'hiker@example.com',
    phone: '+39 333 1111111',
    temporary: false,
  },
  {
    id: 2,
    firstName: 'Marco',
    lastName: 'Rossi',
    email: 'marco.rossi@example.com',
    phone: '+39 333 1234567',
    temporary: false,
  },
  {
    id: 3,
    firstName: 'Giulia',
    lastName: null,
    email: null,
    phone: '+39 333 7654321',
    temporary: true, // quick entry
  },
];

let nextHikerId = hikers.length + 1;

// Mock staff bookings (not persisted across page reloads like hiker bookings).
const staffBookings = [];
let nextBookingId = 1;

// Every mock slot has these tables (like the seed): 4 + 4 + 6 = 14 seats.
const TABLES = [
  { id: 1, name: 'T1', seats: 4 },
  { id: 2, name: 'T2', seats: 4 },
  { id: 3, name: 'T3', seats: 6 },
];

/** Logged-in user (from auth.js mock) */
function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('mh-mock-user'));
  } catch {
    return null;
  }
}

/** Date of a slot (slotId is YYYYMMDD * 10 + turn) */
function dateOfSlot(slotId) {
  const day = Math.floor(slotId / 10);
  const text = String(day);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** Generate a random password (same format as real server) */
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

/**
 * Search for hikers by name, phone or email (case-insensitive).
 * Returns up to 20 HikerSummary objects sorted by lastName, firstName.
 */
export async function searchHikers(q) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'Not logged in');
  if (user.role === 'hiker') throw new ApiError(403, 'Staff only');
  if (!q || q.trim().length < 2) {
    throw new ApiError(400, 'Type at least 2 characters to search');
  }

  const query = q.trim().toLowerCase();
  const results = hikers.filter((h) => {
    const fullName = `${h.firstName} ${h.lastName || ''}`.toLowerCase();
    const email = (h.email || '').toLowerCase();
    const phone = (h.phone || '').replace(/\s/g, '');
    return (
      h.firstName.toLowerCase().includes(query) ||
      (h.lastName && h.lastName.toLowerCase().includes(query)) ||
      fullName.includes(query) ||
      email.includes(query) ||
      phone.includes(query)
    );
  });

  return results
    .sort((a, b) => {
      const lastA = a.lastName || '';
      const lastB = b.lastName || '';
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      return a.firstName.localeCompare(b.firstName);
    })
    .slice(0, 20);
}

/**
 * Allocate party to tables (same logic as bookings mock).
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

/**
 * Create a booking for a hiker (existing, new, or temporary).
 * Exactly one of hikerId | newHiker | temporaryHiker must be sent.
 */
export async function createStaffBooking(body = {}) {
  await wait();
  const user = currentUser();
  if (!user) throw new ApiError(401, 'Not logged in');
  if (user.role === 'hiker') throw new ApiError(403, 'Staff only');

  const { hikerId, newHiker, temporaryHiker, slotId, partySize, requirements = [] } = body;

  // Validate exactly one hiker mode
  const modes = [hikerId != null, newHiker != null, temporaryHiker != null];
  if (modes.filter(Boolean).length !== 1) {
    throw new ApiError(400, 'Give exactly one of hikerId, newHiker or temporaryHiker');
  }

  // Validate slot and party size
  if (!Number.isInteger(slotId) || slotId < 1) {
    throw new ApiError(400, 'Invalid slotId');
  }
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new ApiError(400, 'Invalid partySize');
  }

  // Find the slot
  const date = dateOfSlot(slotId);
  let slots;
  try {
    slots = await listPublicSlots(date);
  } catch {
    throw new ApiError(404, 'Slot not found');
  }
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new ApiError(404, 'Slot not found');

  // Staff can book up to the start of the slot, not after: no 2-hour rule (PO #35).
  if (pickerSlotState(slot, date, { untilStart: true }) === 'started') {
    throw new ApiError(400, 'This slot has already started');
  }

  // Determine the hiker
  let hikerToBook = null;
  if (hikerId != null) {
    hikerToBook = hikers.find((h) => h.id === hikerId);
    if (!hikerToBook) throw new ApiError(404, 'Hiker not found');
  } else if (newHiker != null) {
    // Validate newHiker fields
    const { firstName, lastName, email, phone, notes, emergencyContact } = newHiker;
    if (!firstName || !firstName.trim()) throw new ApiError(400, 'firstName is required');
    if (!lastName || !lastName.trim()) throw new ApiError(400, 'lastName is required');
    if (!email || !email.trim()) throw new ApiError(400, 'email is required');
    if (!phone || !phone.trim()) throw new ApiError(400, 'phone is required');
    if (!isValidPhoneNumber(phone.trim())) {
      throw new ApiError(400, 'Invalid phone number');
    }
    // Check email not in use
    if (hikers.some((h) => h.email && h.email.toLowerCase() === email.trim().toLowerCase())) {
      throw new ApiError(409, 'Email already in use');
    }
    hikerToBook = {
      id: nextHikerId++,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      temporary: false,
      notes: notes ? notes.trim() : null,
      emergencyContact: emergencyContact ? emergencyContact.trim() : null,
      generatedPassword: generatePassword(),
    };
    hikers.push(hikerToBook);
  } else if (temporaryHiker != null) {
    // Validate temporaryHiker fields
    const { firstName, lastName, phone } = temporaryHiker;
    if (!firstName || !firstName.trim()) throw new ApiError(400, 'firstName is required');
    if (phone && !isValidPhoneNumber(phone.trim())) {
      throw new ApiError(400, 'Invalid phone number');
    }
    hikerToBook = {
      id: nextHikerId++,
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : null,
      email: null,
      phone: phone ? phone.trim() : null,
      temporary: true,
    };
    hikers.push(hikerToBook);
  }

  // Check if hiker already has a booking for this slot
  if (
    staffBookings.some(
      (b) => b.hikerId === hikerToBook.id && b.slot.id === slotId
    )
  ) {
    throw new ApiError(409, 'This hiker already has a booking for this slot');
  }

  // Check seats availability
  const taken = (tableId) =>
    staffBookings
      .filter((b) => b.slot.id === slotId)
      .flatMap((b) => b.tables)
      .filter((t) => t.slotTableId === tableId)
      .reduce((sum, t) => sum + t.seats, 0);
  // A "full" slot of the mock has no free seat at all.
  const free = TABLES.map((t) => ({ ...t, free: slot.bookingState === 'full' ? 0 : t.seats - taken(t.id) }));
  const split = allocate(free, partySize);
  if (!split) throw new ApiError(409, 'Not enough seats available for this party');

  // Create the booking
  const booking = {
    id: nextBookingId++,
    hikerId: hikerToBook.id,
    slot: { id: slot.id, date, startTime: slot.startTime, endTime: slot.endTime, label: slot.label },
    partySize,
    tables: split.map(({ table, seats }) => ({ slotTableId: table.id, tableName: table.name, seats })),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    requirements: (requirements || []).map(({ hasAllergies, description }) => ({
      hasAllergies, description: description.trim(),
    })),
  };
  staffBookings.push(booking);

  // Build the response: Booking + hiker + optional generatedPassword
  const { generatedPassword, notes: _notes, emergencyContact: _ec, ...hikerSummary } = hikerToBook;
  const response = {
    ...booking,
    hiker: hikerSummary,
  };
  if (generatedPassword) {
    response.generatedPassword = generatedPassword;
  }
  return response;
}
