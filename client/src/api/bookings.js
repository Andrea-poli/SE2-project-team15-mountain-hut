// Bookings (openapi.yaml, tag bookings) – MH-01, MH-06. Hikers only; the session cookie identifies the hiker.
//   POST  /api/bookings {slotId, partySize, requirements?} → 201 Booking | 400 | 401 | 403 | 404 slot | 409
//   GET   /api/bookings                    → 200 MyBooking[] | 401 | 403 (MH-06: upcoming first, then past)
//   GET   /api/bookings/:id                → 200 Booking | 400 | 401 | 404 (also someone else's)
//   PATCH /api/bookings/:id {slotId?, partySize?, requirements?} → 200 Booking | 400 | 401 | 404 | 409 (MH-06)
//   POST  /api/bookings/:id/cancel         → 200 Booking (cancelled) | 400 | 401 | 404 | 409 already cancelled (MH-08)
// Booking: { id, slot: {id, date, startTime, endTime, label}, partySize, tables: [{slotTableId, tableName, seats}],
//            requirements: [{hasAllergies, description}], status, createdAt }; MyBooking adds `changeable`.
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/bookings.js')
    : Promise.reject(new Error('Mocks are off'));

/** Books a table for the logged-in hiker. Throws ApiError (409 when the seats are gone). */
export async function createBooking({ slotId, partySize, requirements }) {
  const booking = { slotId, partySize };
  if (requirements !== undefined) booking.requirements = requirements;
  if (useMocks) return (await mocks()).createBooking(booking);
  return apiFetch('/api/bookings', { method: 'POST', body: booking });
}

/** One booking of the logged-in hiker. Throws ApiError (404 for unknown or not yours). */
export async function getBooking(id) {
  if (useMocks) return (await mocks()).getBooking(id);
  return apiFetch(`/api/bookings/${encodeURIComponent(id)}`);
}

/** Every booking of the logged-in hiker, in the server's order, each with `changeable`. Throws ApiError. */
export async function listMyBookings() {
  if (useMocks) return (await mocks()).listMyBookings();
  return apiFetch('/api/bookings');
}

/**
 * Changes a booking of the logged-in hiker. `change` holds only the fields to change (slotId, partySize,
 * requirements); undefined fields are not sent. Throws ApiError (400 window or cancelled, 409 seats or slot).
 */
export async function changeBooking(id, { slotId, partySize, requirements } = {}) {
  const change = {};
  if (slotId !== undefined) change.slotId = slotId;
  if (partySize !== undefined) change.partySize = partySize;
  if (requirements !== undefined) change.requirements = requirements;
  if (useMocks) return (await mocks()).changeBooking(id, change);
  return apiFetch(`/api/bookings/${encodeURIComponent(id)}`, { method: 'PATCH', body: change });
}

/**
 * Cancels a booking of the logged-in hiker, at any time (PO issue #8); resolves to the booking, now cancelled.
 * Throws ApiError (404 unknown or not yours, 409 already cancelled).
 */
export async function cancelBooking(id) {
  if (useMocks) return (await mocks()).cancelBooking(id);
  return apiFetch(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}
