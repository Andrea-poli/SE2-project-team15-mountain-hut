// Client-side checks of form values, run on submit. Pure functions, shared by every form.
// The rules are the same as the mock server (api/mocks/auth.js): realign them with U5 when it lands.
// The mobile number check is in utils/phone.js (it needs libphonenumber-js).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

export function isEmail(value) {
  return EMAIL_RE.test(value.trim());
}
