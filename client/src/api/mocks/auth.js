// Mock of the auth endpoints (VITE_USE_MOCKS=true): same results and errors as the server,
// no server needed. Only loaded through a dynamic import in api/auth.js.
import { isValidPhoneNumber } from 'libphonenumber-js';
import { MAX_LENGTH, tooLongMessage } from '../../utils/validation.js';
import { ApiError } from '../client.js';

const DELAY_MS = 300;
const STORAGE_KEY = 'mh-mock-user';

// TODO: align with seed.js (U10); remove together with all mocks if the team drops mock mode.
const users = [
  { id: 1, firstName: 'Hannah', lastName: 'Hiker', email: 'hiker@example.com', phone: '+39 333 1111111', role: 'hiker', password: 'hikerpass' },
  { id: 2, firstName: 'Eric', lastName: 'Employee', email: 'employee@example.com', phone: null, role: 'employee', password: 'employeepass' },
  { id: 3, firstName: 'Wendy', lastName: 'Warden', email: 'warden@example.com', phone: '+39 333 3333333', role: 'warden', password: 'wardenpass' },
  // MH-07: a hiker created by staff, who must change the generated password at the next login.
  { id: 4, firstName: 'Paolo', lastName: 'Neri', email: 'paolo.neri@example.com', phone: '+39 333 4444444',
    role: 'hiker', password: 'generated1', mustChangePassword: true },
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

// Same check and metadata as utils/phone.js and the server (U5): the number is E.164.
const isPhone = (value) => isValidPhoneNumber(value.trim());

// Same limits as the form (utils/validation.js), text counted trimmed, the password as typed.
// The message is the form's one without the final full stop, like the other server messages.
function checkLength(value, name, label) {
  const length = name === 'password' ? value.length : value.trim().length;
  if (length > MAX_LENGTH[name]) throw new ApiError(400, tooLongMessage(label, MAX_LENGTH[name]));
}

export async function register(data = {}) {
  await wait();
  const { firstName, lastName, email, password, phone, notes, emergencyContact } = data;
  if ([firstName, lastName, email, password, phone].some(isBlank)) {
    throw new ApiError(400, 'First name, last name, email, password and mobile number are required');
  }
  checkLength(firstName, 'firstName', 'First name');
  checkLength(lastName, 'lastName', 'Last name');
  if (!EMAIL_RE.test(email.trim())) throw new ApiError(400, 'Email is not valid');
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters long');
  checkLength(password, 'password', 'The password');
  if (!isPhone(phone)) throw new ApiError(400, 'Mobile number is not valid');
  if (!isBlank(notes)) checkLength(notes, 'notes', 'Notes');
  if (!isBlank(emergencyContact)) checkLength(emergencyContact, 'emergencyContact', 'Emergency contact');
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

// MH-07 – password change and reset. The mock has no email: the reset link is printed on the browser console.
const resetTokens = new Map(); // token → user id (one link per user, like the server)

export async function changePassword(currentPassword, newPassword) {
  await wait();
  const current = loadUser();
  if (!current) throw new ApiError(401, 'Not logged in');
  if (isBlank(currentPassword) || isBlank(newPassword)) {
    throw new ApiError(400, 'Current and new password are required');
  }
  if (newPassword.length < 8) throw new ApiError(400, 'Password must be at least 8 characters long');
  const found = users.find((u) => u.id === current.id);
  if (found.password !== currentPassword) throw new ApiError(401, 'The current password is wrong');
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }
  found.password = newPassword;
  delete found.mustChangePassword;
  const user = toUser(found);
  saveUser(user);
  return user;
}

export async function requestPasswordReset(email) {
  await wait();
  if (isBlank(email) || !EMAIL_RE.test(email.trim())) throw new ApiError(400, 'Enter a valid email');
  const found = findByEmail(email);
  if (!found) return null;
  for (const [token, id] of resetTokens) if (id === found.id) resetTokens.delete(token);
  const token = crypto.randomUUID();
  resetTokens.set(token, found.id);
  console.info(`[mock email] reset link for ${found.email}: /reset-password?token=${token}`);
  return null;
}

export async function confirmPasswordReset(token, newPassword) {
  await wait();
  if (isBlank(token) || isBlank(newPassword)) throw new ApiError(400, 'The link and a new password are required');
  if (newPassword.length < 8) throw new ApiError(400, 'Password must be at least 8 characters long');
  const id = resetTokens.get(token);
  if (!id) throw new ApiError(400, 'This link is not valid or has expired: ask for a new one');
  resetTokens.delete(token);
  const found = users.find((u) => u.id === id);
  found.password = newPassword;
  delete found.mustChangePassword;
  saveUser(null); // every session of that user ends
  return null;
}
