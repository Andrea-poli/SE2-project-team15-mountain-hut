// Bookings (openapi.yaml, tag bookings) – MH-01. Hikers only; the session cookie identifies the hiker.
//   POST /api/bookings {slotId, partySize} → 201 Booking | 400 | 401 | 403 | 404 slot | 409
//   GET  /api/bookings/:id                 → 200 Booking | 400 | 401 | 404 (also someone else's)
// Booking: { id, slot: {id, date, startTime, endTime, label}, partySize, tables: [{slotTableId, tableName, seats}],
//            status, createdAt }
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/bookings.js')
    : Promise.reject(new Error('Mocks are off'));

/** Books a table for the logged-in hiker. Throws ApiError (409 when the seats are gone). */
export async function createBooking({ slotId, partySize }) {
  if (useMocks) return (await mocks()).createBooking({ slotId, partySize });
  return apiFetch('/api/bookings', { method: 'POST', body: { slotId, partySize } });
}

/** One booking of the logged-in hiker. Throws ApiError (404 for unknown or not yours). */
export async function getBooking(id) {
  if (useMocks) return (await mocks()).getBooking(id);
  return apiFetch(`/api/bookings/${encodeURIComponent(id)}`);
}
