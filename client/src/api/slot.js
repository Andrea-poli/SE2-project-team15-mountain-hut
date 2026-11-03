// Slot endpoints (openapi.yaml, tag slots).
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/slot.js')
    : Promise.reject(new Error('Mocks are off'));

// GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD → 200 Slot[]
export async function listSlots(from, to) {
  if (useMocks) return (await mocks()).listSlots(from, to);
  const query = new URLSearchParams({ from, to });
  return apiFetch(`/api/slots?${query}`);
}
