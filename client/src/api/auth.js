// Auth endpoints (openapi.yaml, tag auth). Every function resolves to a User
// {id, firstName, lastName, email, phone, role} or null, and throws ApiError on failure.
// Mocks are loaded with a dynamic import only when useMocks is true, so they
// (and their demo passwords) never end up in the production bundle.
import { apiFetch, useMocks } from './client.js';

// import.meta.env is written here, not useMocks: Vite replaces it with a constant at build time,
// so without mocks the import() is dead code and the mock chunk is not emitted at all.
const mocks = () =>
  import.meta.env.VITE_USE_MOCKS === 'true' ? import('./mocks/auth.js') : Promise.reject(new Error('Mocks are off'));

// POST /api/auth/register {firstName, lastName, email, password, phone, notes?, emergencyContact?}
//   → 201 User (logged in) | 400 | 409 "Email already in use"
// TODO: align with the updated contract (U2) and U5: phone required, notes and emergencyContact
// are new (PO, context.md "Hiker Information"); openapi.yaml still has phone optional.
export async function register(data) {
  if (useMocks) return (await mocks()).register(data);
  return apiFetch('/api/auth/register', { method: 'POST', body: data });
}

// POST /api/auth/login → 200 User | 400 "Email and password are required" | 401 "Invalid email or password"
export async function login(email, password) {
  if (useMocks) return (await mocks()).login(email, password);
  return apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
}

// POST /api/auth/logout → 204 (also with no active session)
export async function logout() {
  if (useMocks) return (await mocks()).logout();
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

// GET /api/auth/me → 200 User | 401 "Not logged in"
export async function me() {
  if (useMocks) return (await mocks()).me();
  return apiFetch('/api/auth/me');
}
