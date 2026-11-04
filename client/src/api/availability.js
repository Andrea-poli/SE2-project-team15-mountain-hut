// Availability check (openapi.yaml checkAvailability) – MH-04. Public: no login needed.
//   GET /api/public/slots/:id/availability?partySize=N → 200 { available, split: [{slotTableId, tableName, seats}] }
//                                                      | 400 | 404 slot
// A closed slot, or one starting within 2 h, answers { available: false, split: [] }, never an error.
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/availability.js')
    : Promise.reject(new Error('Mocks are off'));

/** Is there room for `partySize` people in the slot, and how would they sit? */
export async function checkAvailability(slotId, partySize) {
  if (useMocks) return (await mocks()).checkAvailability(slotId, partySize);
  const query = new URLSearchParams({ partySize: String(partySize) });
  return apiFetch(`/api/public/slots/${encodeURIComponent(slotId)}/availability?${query}`);
}
