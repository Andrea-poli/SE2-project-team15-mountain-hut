// Slots endpoints (openapi.yaml, tag slots).
// Mocks are loaded only when VITE_USE_MOCKS is true (same pattern as api/auth.js).
import { apiFetch, useMocks } from './client.js';

const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true'
    ? import('./mocks/slots.js')
    : Promise.reject(new Error('Mocks are off'));

// GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD → 200 Slot[]
export async function listSlots(from, to) {
  if (useMocks) return (await mocks()).listSlots(from, to);
  const query = new URLSearchParams({ from, to });
  return apiFetch(`/api/slots?${query}`);
}

// POST /api/slots → 201 Slot | 400 InvalidSlot | 401 NotLoggedIn | 403 Forbidden
export async function createSlot(slot) {
  if (useMocks) return (await mocks()).createSlot(slot);
  return apiFetch('/api/slots', { method: 'POST', body: slot });
}

// POST /api/slots/copy-week { sourceWeek, targetWeek } (any date of each week)
// → 201 CopyWeekResult | 400 Error | 401 NotLoggedIn | 403 Forbidden | 409 Error (the target week has bookings)
export async function copyWeek(sourceWeek, targetWeek) {
  if (useMocks) return (await mocks()).copyWeek(sourceWeek, targetWeek);
  return apiFetch('/api/slots/copy-week', { method: 'POST', body: { sourceWeek, targetWeek } });
}

// MH-10: PUT /api/slots/{id}/menu { menu } (a text, or null to clear it)
// → 200 Slot | 400 Error | 401 NotLoggedIn | 403 Forbidden | 404 Error (unknown slot)
export async function setSlotMenu(id, menu) {
  if (useMocks) return (await mocks()).setSlotMenu(id, menu);
  return apiFetch(`/api/slots/${id}/menu`, { method: 'PUT', body: { menu } });
}

// MH-10: GET /api/slots/menus?q= → 200 PreviousMenu[] (most recent first, at most 20) | 400 | 401 | 403
// An empty q (no filter) is not sent.
export async function listPreviousMenus(q = '') {
  if (useMocks) return (await mocks()).listPreviousMenus(q);
  const text = q.trim();
  return apiFetch(text ? `/api/slots/menus?${new URLSearchParams({ q: text })}` : '/api/slots/menus');
}
