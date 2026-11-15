// Staff endpoints (MH-07): search hikers and create bookings for them.
// POST /api/staff/bookings: Exactly one of hikerId | newHiker | temporaryHiker.
// GET /api/staff/hikers?q=: Search by name, phone, email (min 2 chars).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/staff.js')
    : Promise.reject(new Error('Mocks are off'));

/**
 * Search for hikers by name, phone or email. Query must have at least 2 chars.
 * Returns up to 20 HikerSummary objects, sorted by last name then first name.
 * Throws ApiError (400 if q is too short, 401/403 for auth).
 */
export async function searchHikers(q) {
  if (useMocks) return (await mocks()).searchHikers(q);
  return apiFetch(`/api/staff/hikers?q=${encodeURIComponent(q)}`);
}

/**
 * Create a booking for a hiker (existing, new, or temporary).
 * Body: exactly one of hikerId | newHiker | temporaryHiker, plus slotId, partySize, optional requirements.
 * Returns StaffBooking (includes hiker and generatedPassword if newHiker was sent).
 * Throws ApiError (400/401/403/404/409).
 */
export async function createStaffBooking(body) {
  if (useMocks) return (await mocks()).createStaffBooking(body);
  return apiFetch('/api/staff/bookings', { method: 'POST', body });
}
