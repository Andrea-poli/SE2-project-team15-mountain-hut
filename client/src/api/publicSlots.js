// Public slots (openapi.yaml, tag public) – used by the SlotPicker (MH-01, reused by MH-04).
// GET /api/public/slots?date=YYYY-MM-DD → 200 [{ id, label, startTime, endTime, bookingState }] | 400
// bookingState: 'bookable' | 'full' | 'tooLate' (closed less than 2 h before the start, PO).
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/publicSlots.js')
    : Promise.reject(new Error('Mocks are off'));

/** The meal slots of one day, ordered by start time. */
export async function listPublicSlots(date) {
  if (useMocks) return (await mocks()).listPublicSlots(date);
  return apiFetch(`/api/public/slots?date=${encodeURIComponent(date)}`);
}
