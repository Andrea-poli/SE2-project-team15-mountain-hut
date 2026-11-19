// MH-01 FE1 – slot selection form: date → time → party size (shared: also used by MH-04).
// The parent owns the values and the submit button; SlotPicker shows the fields, loads the slots
// of the chosen day and reports every change with onChange({ date, slotId, partySize }).
// The form logic (validation, URL prefill, option text) is in utils/slotPicker.js.
//
//   const [value, setValue] = useState(() => slotPickerValueFromParams(searchParams));
//   <Form noValidate onSubmit={…}>
//     <SlotPicker idPrefix="book" value={value} onChange={setValue} errors={errors} />
//     <Button type="submit">Confirm</Button>
//   </Form>
//
// Rules (PO, MH-01 / MH-04 and openapi PublicSlot):
// - all three fields are required; the time menu lists the slots of the chosen day;
// - slots that are full or closed (less than 2 h before the start) are shown but cannot be chosen,
//   with the reason in the option text; no seat counts are shown;
// - a day with no slots shows "No meal service on this day";
// - party size: a whole number, at least 1, no upper limit (PO, issue #27).
// MH-06 (Change booking) adds two optional props, unused by Book and Check availability: currentSlotId and
// minNoticeHours (48 h change window, PO issue #43). MH-07 (staff reservation) adds untilStart: no 2-hour rule.
import { CalendarDays, Clock, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import Form from 'react-bootstrap/Form';
import { listPublicSlots } from '../api/publicSlots.js';
import { isIsoDate, toIsoDate } from '../utils/dates.js';
import {
  isSelectableState,
  pickerSlotState,
  slotOptionLabel,
  slotOptionState,
  slotPickerFieldIds,
} from '../utils/slotPicker.js';
import ErrorMessage from './ErrorMessage.jsx';
import FieldLabel from './FieldLabel.jsx';
import FormField from './FormField.jsx';
import Loading from './Loading.jsx';

/**
 * The slots of `date`: { slots, error } once the answer for that date has arrived, otherwise null.
 * The result remembers its date, so an old answer never shows under a newer date.
 */
function useDaySlots(date) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isIsoDate(date)) return undefined;
    let cancelled = false;
    listPublicSlots(date).then(
      (slots) => !cancelled && setResult({ date, slots, error: null }),
      (err) => !cancelled && setResult({ date, slots: null, error: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [date]);

  return result?.date === date ? result : null;
}

/** The help under Time: which slots cannot be chosen, for the hikers (2 hours), staff or a change. */
function timeHelp(minNoticeHours, untilStart) {
  if (minNoticeHours) return `Full slots and slots starting in less than ${minNoticeHours} hours cannot be chosen.`;
  if (untilStart) return 'Full slots and slots that have already started cannot be chosen.';
  return 'Full slots and slots starting in less than 2 hours cannot be chosen.';
}

/**
 * @param {object} props
 * @param {string} props.idPrefix   prefix of the control ids, unique in the page (e.g. "book")
 * @param {{date: string, slotId: number|null, partySize: string}} props.value
 * @param {(value: object) => void} props.onChange
 * @param {{date?: string, slotId?: string, partySize?: string}} [props.errors]
 * @param {(name: string) => void} [props.onBlurField] e.g. recheck of useFormErrors
 * @param {Date} [props.today] first selectable day, and "now" for minNoticeHours (tests pass a fixed one)
 * @param {number} [props.currentSlotId] MH-06: the slot of the booking being changed, always selectable,
 *   its option ends with " – your booking"
 * @param {number} [props.minNoticeHours] MH-06: slots starting sooner than this are shown but disabled, and
 *   the first selectable day is the day of now + minNoticeHours
 * @param {boolean} [props.untilStart] staff (MH-07): a slot can be chosen until it starts, no 2-hour rule
 */
export default function SlotPicker({
  idPrefix,
  value,
  onChange,
  errors = {},
  onBlurField,
  today,
  currentSlotId,
  minNoticeHours,
  untilStart,
}) {
  const ids = slotPickerFieldIds(idPrefix);
  const now = today ?? new Date();
  const minDate = toIsoDate(minNoticeHours ? new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000) : now);

  const day = useDaySlots(value.date);
  const slots = day?.slots ?? null;
  const loading = isIsoDate(value.date) && !day;
  // Staff (MH-07, untilStart) first: a slot closed only by the 2-hour rule stays bookable until it starts;
  // then the Change booking page (MH-06): the booking's own slot, and the minimum notice.
  const stateOf = (slot) =>
    slotOptionState({ ...slot, bookingState: pickerSlotState(slot, value.date, { untilStart, now }) }, value.date, {
      currentSlotId,
      minNoticeHours,
      now,
    });

  // A prefilled or previous slotId that is not a selectable slot of this day is dropped.
  const chosen = slots?.find((s) => s.id === value.slotId);
  const staleSlot = slots && value.slotId != null && !(chosen && isSelectableState(stateOf(chosen)));
  useEffect(() => {
    if (staleSlot) onChange({ ...value, slotId: null });
  }, [staleSlot, value, onChange]);

  function set(field, fieldValue) {
    // A new day empties the time: the slots are not the same.
    const next = field === 'date' ? { ...value, date: fieldValue, slotId: null } : { ...value, [field]: fieldValue };
    onChange(next);
  }

  const timeHelpId = `${ids.slotId}-help`;
  const timeErrorId = errors.slotId ? `${ids.slotId}-error` : undefined;

  return (
    <fieldset className="mb-2">
      <legend className="visually-hidden">Date, time and party size</legend>

      <FormField
        id={ids.date}
        label="Date"
        icon={CalendarDays}
        type="date"
        min={minDate}
        value={value.date}
        onChange={(e) => set('date', e.target.value)}
        onBlur={() => onBlurField?.('date')}
        required
        error={errors.date}
      />

      <Form.Group controlId={ids.slotId} className="mb-3">
        <FieldLabel icon={Clock}>Time</FieldLabel>
        {loading && <Loading />}
        <ErrorMessage message={day?.error} />
        {slots && slots.length === 0 ? (
          <p id={timeHelpId} className="mb-0">
            No meal service on this day.
          </p>
        ) : (
          <>
            <Form.Select
              value={staleSlot ? '' : (value.slotId ?? '')}
              onChange={(e) => set('slotId', e.target.value ? Number(e.target.value) : null)}
              onBlur={() => onBlurField?.('slotId')}
              disabled={!slots}
              required
              isInvalid={Boolean(errors.slotId)}
              aria-invalid={errors.slotId ? true : undefined}
              aria-describedby={[timeErrorId, timeHelpId].filter(Boolean).join(' ')}
            >
              <option value="">{slots ? 'Choose a time' : 'Choose a date first'}</option>
              {slots?.map((slot) => {
                const state = stateOf(slot);
                return (
                  <option key={slot.id} value={slot.id} disabled={!isSelectableState(state)}>
                    {slotOptionLabel(slot, state, minNoticeHours)}
                  </option>
                );
              })}
            </Form.Select>
            {errors.slotId && (
              <Form.Control.Feedback type="invalid" id={timeErrorId}>
                {errors.slotId}
              </Form.Control.Feedback>
            )}
            <Form.Text id={timeHelpId} className="d-block">
              {timeHelp(minNoticeHours, untilStart)}
            </Form.Text>
          </>
        )}
      </Form.Group>

      <FormField
        id={ids.partySize}
        label="Number of people"
        icon={Users}
        help="Everyone in your party, you included."
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={value.partySize}
        onChange={(e) => set('partySize', e.target.value)}
        onBlur={() => onBlurField?.('partySize')}
        required
        error={errors.partySize}
      />
    </fieldset>
  );
}
