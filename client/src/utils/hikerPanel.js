// MH-07 FE1 – the logic of the HikerPanel, without React (as utils/slotPicker.js is for the SlotPicker).
// Three ways to say who a staff booking is for (openapi NewStaffBooking): an existing hiker found by the
// search, a new full hiker (a regular profile; the server generates the password, PO #36), or a quick entry
// (a temporary hiker: first name and optional phone, who cannot log in, PO #5).
import { isPhone } from './phone.js';
import { isBlank, isEmail, MAX_LENGTH, tooLongMessage } from './validation.js';

/** The panel's value: the chosen mode and what each mode holds (switching mode keeps what was typed). */
export const EMPTY_HIKER = Object.freeze({
  mode: 'existing',
  hikerId: null,
  chosen: null, // the HikerSummary of hikerId, to show who was chosen
  newHiker: { firstName: '', lastName: '', email: '', phone: '', notes: '', emergencyContact: '' },
  temporaryHiker: { firstName: '', lastName: '', phone: '' },
});

/** Control ids of the fields of `mode`, in form order (for useFormErrors and focus). */
export function hikerPanelFieldIds(idPrefix, mode) {
  if (mode === 'existing') return { hikerId: `${idPrefix}-hiker-search` };
  const p = `${idPrefix}-${mode}`;
  if (mode === 'new') {
    return {
      firstName: `${p}-first-name`,
      lastName: `${p}-last-name`,
      email: `${p}-email`,
      phone: `${p}-phone`,
      notes: `${p}-notes`,
      emergencyContact: `${p}-emergency-contact`,
    };
  }
  return { firstName: `${p}-first-name`, lastName: `${p}-last-name`, phone: `${p}-phone` };
}

const tooLong = (value, field) => value.trim().length > MAX_LENGTH[field];
const tooLongError = (label, field) => `${tooLongMessage(label, MAX_LENGTH[field])}.`;

function nameErrors(v, errors, { lastNameRequired }) {
  if (isBlank(v.firstName)) errors.firstName = "Enter the hiker's first name.";
  else if (tooLong(v.firstName, 'firstName')) errors.firstName = tooLongError('First name', 'firstName');
  if (lastNameRequired && isBlank(v.lastName)) errors.lastName = "Enter the hiker's last name.";
  else if (tooLong(v.lastName, 'lastName')) errors.lastName = tooLongError('Last name', 'lastName');
}

/** Field errors of the panel's value, for the parent's useFormErrors (keys of hikerPanelFieldIds). */
export function validateHiker({ mode, hikerId, newHiker, temporaryHiker }) {
  const errors = {};
  if (mode === 'existing') {
    if (!hikerId) errors.hikerId = 'Search for the hiker and choose one from the results.';
  } else if (mode === 'new') {
    nameErrors(newHiker, errors, { lastNameRequired: true });
    if (isBlank(newHiker.email)) errors.email = "Enter the hiker's email.";
    else if (!isEmail(newHiker.email)) errors.email = 'Enter a valid email, e.g. name@example.com.';
    if (isBlank(newHiker.phone)) errors.phone = "Enter the hiker's mobile number.";
    else if (!isPhone(newHiker.phone)) errors.phone = 'Enter a valid mobile number for the chosen country.';
    if (tooLong(newHiker.notes, 'notes')) errors.notes = tooLongError('Notes', 'notes');
    if (tooLong(newHiker.emergencyContact, 'emergencyContact')) {
      errors.emergencyContact = tooLongError('Emergency contact', 'emergencyContact');
    }
  } else {
    nameErrors(temporaryHiker, errors, { lastNameRequired: false });
    if (!isBlank(temporaryHiker.phone) && !isPhone(temporaryHiker.phone)) {
      errors.phone = 'Enter a valid mobile number for the chosen country, or leave it empty.';
    }
  }
  return errors;
}

const optional = (text) => (isBlank(text) ? undefined : text.trim());

/** The hiker part of the POST /api/staff/bookings body: exactly one of hikerId | newHiker | temporaryHiker. */
export function staffBookingHiker({ mode, hikerId, newHiker, temporaryHiker }) {
  if (mode === 'existing') return { hikerId };
  if (mode === 'new') {
    return {
      newHiker: {
        firstName: newHiker.firstName.trim(),
        lastName: newHiker.lastName.trim(),
        email: newHiker.email.trim(),
        phone: newHiker.phone,
        notes: optional(newHiker.notes),
        emergencyContact: optional(newHiker.emergencyContact),
      },
    };
  }
  return {
    temporaryHiker: {
      firstName: temporaryHiker.firstName.trim(),
      lastName: optional(temporaryHiker.lastName),
      phone: optional(temporaryHiker.phone),
    },
  };
}

/** "Marco Rossi · marco.rossi@example.com · +39 333 1234567", "Giulia · temporary hiker" (search results). */
export function hikerSummaryText({ firstName, lastName, email, phone, temporary }) {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return [name, email, phone, temporary ? 'temporary hiker' : null].filter(Boolean).join(' · ');
}
