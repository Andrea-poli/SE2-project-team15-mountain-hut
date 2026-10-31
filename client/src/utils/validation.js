// Client-side checks of form values, run on submit. Pure functions, shared by every form.
// The rules are the same as the mock server (api/mocks/auth.js), which imports the limits from here.
// The mobile number check is in utils/phone.js (it needs libphonenumber-js).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

// Longest accepted value of the registration fields (agreed with the team), counted after trimming
// the spaces at the ends; the password as typed. Checked on submit, not with the HTML maxLength
// attribute: that one cuts typed or pasted text without telling the user.
export const MAX_LENGTH = {
  firstName: 100,
  lastName: 100,
  password: 128,
  notes: 500,
  emergencyContact: 200,
};

/** "Notes must be 500 characters or fewer" – the form adds the final full stop, the mock does not. */
export function tooLongMessage(label, max) {
  return `${label} must be ${max} characters or fewer`;
}

export function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

export function isEmail(value) {
  return EMAIL_RE.test(value.trim());
}
