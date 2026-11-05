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
import { useEffect, useState } from 'react';
import Form from 'react-bootstrap/Form';
import { listPublicSlots } from '../api/publicSlots.js';
import { isIsoDate, toIsoDate } from '../utils/dates.js';
import { slotOptionLabel, slotPickerFieldIds } from '../utils/slotPicker.js';
import ErrorMessage from './ErrorMessage.jsx';
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

/**
 * @param {object} props
 * @param {string} props.idPrefix   prefix of the control ids, unique in the page (e.g. "book")
 * @param {{date: string, slotId: number|null, partySize: string}} props.value
 * @param {(value: object) => void} props.onChange
 * @param {{date?: string, slotId?: string, partySize?: string}} [props.errors]
 * @param {(name: string) => void} [props.onBlurField] e.g. recheck of useFormErrors
 * @param {Date} [props.today] first selectable day (tests pass a fixed one)
 */
export default function SlotPicker({ idPrefix, value, onChange, errors = {}, onBlurField, today }) {
  const ids = slotPickerFieldIds(idPrefix);
  const minDate = toIsoDate(today ?? new Date());

  const day = useDaySlots(value.date);
  const slots = day?.slots ?? null;
  const loading = isIsoDate(value.date) && !day;

  // A prefilled or previous slotId that is not a bookable slot of this day is dropped.
  const chosen = slots?.find((s) => s.id === value.slotId);
  const staleSlot = slots && value.slotId != null && chosen?.bookingState !== 'bookable';
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
        type="date"
        min={minDate}
        value={value.date}
        onChange={(e) => set('date', e.target.value)}
        onBlur={() => onBlurField?.('date')}
        required
        error={errors.date}
      />

      <Form.Group controlId={ids.slotId} className="mb-3">
        <Form.Label>Time</Form.Label>
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
              {slots?.map((slot) => (
                <option key={slot.id} value={slot.id} disabled={slot.bookingState !== 'bookable'}>
                  {slotOptionLabel(slot)}
                </option>
              ))}
            </Form.Select>
            {errors.slotId && (
              <Form.Control.Feedback type="invalid" id={timeErrorId}>
                {errors.slotId}
              </Form.Control.Feedback>
            )}
            <Form.Text id={timeHelpId} className="d-block">
              Full slots and slots starting in less than 2 hours cannot be chosen.
            </Form.Text>
          </>
        )}
      </Form.Group>

      <FormField
        id={ids.partySize}
        label="Number of people"
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
