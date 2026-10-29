// Mock of the auth endpoints (VITE_USE_MOCKS=true): same results and errors as the server,
// no server needed. Only loaded through a dynamic import in api/auth.js.
import { ApiError } from '../client.js';

const DELAY_MS = 300;
const STORAGE_KEY = 'mh-mock-user';

// TODO: align with seed.js (U10) and U5 messages; remove together with all mocks if the team drops mock mode.
const users = [
  { id: 1, firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', phone: '+39 333 1111111', role: 'hiker', password: 'hikerpass' },
  { id: 2, firstName: 'Eric', lastName: 'Employee', email: 'employee@example.com', phone: null, role: 'employee', password: 'employeepass' },
  { id: 3, firstName: 'Wendy', lastName: 'Warden', email: 'warden@example.com', phone: '+39 333 3333333', role: 'warden', password: 'wardenpass' },
];
let nextId = users.length + 1;

const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

// The client never sees the password, nor the mock-only registration extras.
function toUser({ password: _password, notes: _notes, emergencyContact: _emergencyContact, ...user }) {
  return user;
}

// sessionStorage may be unavailable (private mode, blocked storage): then the login lasts until reload.
let memoryUser = null;

function loadUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return memoryUser;
  }
}

function saveUser(user) {
  memoryUser = user;
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // keep memoryUser only
  }
}

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const findByEmail = (email) => users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

// Same phone rule as utils/validation.js: optional leading +, digits, spaces, hyphens, at least 6 digits.
const isPhone = (value) => /^\+?[\d\s-]+$/.test(value.trim()) && value.replace(/\D/g, '').length >= 6;

export async function register(data = {}) {
  await wait();
  const { firstName, lastName, email, password, phone, notes, emergencyContact } = data;
  // TODO: align with the updated contract (U2) and U5: phone required, notes and emergencyContact
  // (PO, context.md "Hiker Information"). Only the password message is in openapi.yaml.
  if ([firstName, lastName, email, password, phone].some(isBlank)) {
    throw new ApiError(400, 'First name, last name, email, password and mobile number are required');
  }
  if (!EMAIL_RE.test(email.trim())) throw new ApiError(400, 'Email is not valid');
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters long');
  if (!isPhone(phone)) throw new ApiError(400, 'Mobile number is not valid');
  if (findByEmail(email)) throw new ApiError(409, 'Email already in use');

  // notes and emergencyContact are kept by the mock but, like the password, never returned:
  // the user object stays {id, firstName, lastName, email, phone, role}.
  const created = {
    id: nextId++,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    role: 'hiker',
    password,
    notes: isBlank(notes) ? null : notes.trim(),
    emergencyContact: isBlank(emergencyContact) ? null : emergencyContact.trim(),
  };
  users.push(created);
  const user = toUser(created);
  saveUser(user);
  return user;
}

export async function login(email, password) {
  await wait();
  if (isBlank(email) || isBlank(password)) throw new ApiError(400, 'Email and password are required');
  const found = findByEmail(email);
  if (!found || found.password !== password) throw new ApiError(401, 'Invalid email or password');
  const user = toUser(found);
  saveUser(user);
  return user;
}

export async function logout() {
  await wait();
  saveUser(null);
  return null;
}

export async function me() {
  await wait();
  const user = loadUser();
  if (!user) throw new ApiError(401, 'Not logged in');
  return user;
}
