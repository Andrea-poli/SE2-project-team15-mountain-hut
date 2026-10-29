// Client-side checks of form values, run on submit. Pure functions, shared by every form.
// The rules are the same as the mock server (api/mocks/auth.js): realign them with U5 when it lands.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Optional leading +, then digits, spaces and hyphens only.
const PHONE_CHARS_RE = /^\+?[\d\s-]+$/;
const MIN_PHONE_DIGITS = 6;

export const MIN_PASSWORD_LENGTH = 8;

export function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

export function isEmail(value) {
  return EMAIL_RE.test(value.trim());
}

// "+39 333 123-4567" → true; "12345" (5 digits) or "333/1234" → false.
export function isPhone(value) {
  const phone = value.trim();
  return PHONE_CHARS_RE.test(phone) && phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;
}
