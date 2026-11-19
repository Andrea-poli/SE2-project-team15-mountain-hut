// MH-01 FE1 – the logic of the SlotPicker form, without React (kept apart so the component file
// only exports the component, as Vite's fast refresh needs). Shared by MH-01 (book) and MH-04 (check).
import { isIsoDate } from './dates.js';
import { formatTimeRange } from './format.js';

const POSITIVE_INT = /^[1-9]\d*$/;

const HOUR_MS = 60 * 60 * 1000;

const STATE_SUFFIX = {
  full: ' – full',
  tooLate: ' – booking closed',
  current: ' – your booking',
  started: ' – started',
};

/**
 * State of one time option: the slot's bookingState, or on the Change booking page (MH-06):
 * - 'current': the slot of the booking being changed, always selectable (it may look full because of the
 *   booking's own seats);
 * - 'tooSoon': it starts less than `minNoticeHours` after `now` (exactly that many hours is still allowed).
 * `date` is the slot's day (YYYY-MM-DD); without options the result is bookingState, as on the Book page.
 */
export function slotOptionState(slot, date, { currentSlotId, minNoticeHours, now } = {}) {
  if (currentSlotId != null && slot.id === currentSlotId) return 'current';
  if (minNoticeHours && now) {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = slot.startTime.split(':').map(Number);
    const start = new Date(year, month - 1, day, hours, minutes).getTime();
    if (start - now.getTime() < minNoticeHours * HOUR_MS) return 'tooSoon';
  }
  return slot.bookingState;
}

/** True when an option in `state` (from slotOptionState) can be chosen. */
export function isSelectableState(state) {
  return state === 'bookable' || state === 'current';
}

/**
 * The state of a slot in the picker. For hikers it is the server's bookingState. With untilStart (staff: no
 * 2-hour rule, PO #35) a slot closed only by the 2-hour rule can be chosen until it starts, then it is
 * 'started'. Such a slot is tooLate for the server even when it is full (openapi PublicSlot): staff then get
 * "Not enough seats" when confirming.
 */
export function pickerSlotState(slot, date, { untilStart = false, now = new Date() } = {}) {
  if (!untilStart || slot.bookingState !== 'tooLate') return slot.bookingState;
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes) <= now ? 'started' : 'bookable';
}

/**
 * Text of one time option, e.g. "Dinner - 1st turn, 19:00 – 20:30 – full".
 * `state` defaults to the slot's bookingState; 'tooSoon' needs `minNoticeHours` for its text.
 */
export function slotOptionLabel(slot, state = slot.bookingState, minNoticeHours = 0) {
  const time = formatTimeRange(slot.startTime, slot.endTime);
  const name = slot.label ? `${slot.label}, ${time}` : time;
  const suffix = state === 'tooSoon' ? ` – less than ${minNoticeHours} hours away` : STATE_SUFFIX[state];
  return name + (suffix ?? '');
}

/**
 * Initial value from the URL (?date=&slotId=&partySize=), so a link can prefill the form.
 * Invalid parts are dropped.
 */
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
