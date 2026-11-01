// MH-01 FE1 – the logic of the SlotPicker form, without React (kept apart so the component file
// only exports the component, as Vite's fast refresh needs). Shared by MH-01 (book) and MH-04 (check).
import { isIsoDate } from './dates.js';
import { formatTimeRange } from './format.js';

const POSITIVE_INT = /^[1-9]\d*$/;

const STATE_SUFFIX = {
  full: ' – full',
  tooLate: ' – booking closed',
};

/** Text of one time option, e.g. "Dinner - 1st turn, 19:00 – 20:30 – full". */
export function slotOptionLabel(slot) {
  const time = formatTimeRange(slot.startTime, slot.endTime);
  const name = slot.label ? `${slot.label}, ${time}` : time;
  return name + (STATE_SUFFIX[slot.bookingState] ?? '');
}

/** Initial value from the URL (?date=&slotId=&partySize=), so a link can prefill the form. Invalid parts are dropped. */
export function slotPickerValueFromParams(params) {
  const date = params.get('date');
  const slotId = params.get('slotId');
  const partySize = params.get('partySize');
  return {
    date: isIsoDate(date) ? date : '',
    slotId: POSITIVE_INT.test(slotId ?? '') ? Number(slotId) : null,
    partySize: POSITIVE_INT.test(partySize ?? '') ? partySize : '',
  };
}

/** The same value as URL search params (e.g. MH-04's "Book this table" link to the booking page). */
export function slotPickerValueToParams({ date, slotId, partySize }) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (slotId) params.set('slotId', String(slotId));
  if (partySize) params.set('partySize', String(partySize).trim());
  return params;
}

/** Field errors of a value, for the parent's useFormErrors (keys: date, slotId, partySize). */
export function validateSlotPicker({ date, slotId, partySize }) {
  const errors = {};
  if (!isIsoDate(date)) errors.date = 'Choose a date.';
  if (!slotId) errors.slotId = 'Choose a time.';
  if (!POSITIVE_INT.test(String(partySize ?? '').trim())) errors.partySize = 'Enter the number of people, at least 1.';
  return errors;
}

/** True when the three fields hold a valid choice (e.g. to enable the submit button). */
export function isSlotPickerComplete(value) {
  return Object.keys(validateSlotPicker(value)).length === 0;
}

/** Control ids of the three fields, in form order (for useFormErrors and focus). */
export function slotPickerFieldIds(idPrefix) {
  return { date: `${idPrefix}-date`, slotId: `${idPrefix}-time`, partySize: `${idPrefix}-party-size` };
}
