// MH-06 FE2 – Change booking (hikers only: the router puts the page behind RequireRole).
// The booking is read from GET /api/bookings (listMyBookings) and found by the :id of the URL; the server's
// `changeable` says whether the form is shown (48-hour change window, PO issue #43).
// The form is the Book page's one, prefilled: SlotPicker (only slots starting at least 48 h from now, the booked
// slot always allowed) and the requirements editor (MH-05). Save → PATCH /api/bookings/:id with only the changed
// fields → My bookings, which says "Booking changed" and highlights the card.
// Server refusals: 409 (seats, or already booked that slot) on the time field, as on the Book page;
// 400 (e.g. the window closed meanwhile) and other errors in one message above the form.
import { Armchair, ArrowLeft, Ban, CalendarDays, CircleAlert, Clock, Info, LockKeyhole, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { Link, useNavigate, useParams } from 'react-router';
import { changeBooking, listMyBookings } from '../../api/bookings.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Loading from '../../components/Loading.jsx';
import PartyRequirements from '../../components/PartyRequirements.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { routes } from '../../routes.js';
import { peopleText, seatSplitText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import { slotPickerFieldIds, validateSlotPicker } from '../../utils/slotPicker.js';
import { areRequirementsValid } from '../../utils/validation.js';

const ID_PREFIX = 'change';
const FIELD_IDS = slotPickerFieldIds(ID_PREFIX);
// Change window (openapi, MH-06): the new slot must start at least 48 h from now.
const MIN_NOTICE_HOURS = 48;

/** The hiker's booking `id` (from the URL): { booking } (null when not found) or { error }; null while loading. */
function useMyBooking(id) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    listMyBookings().then(
      (bookings) => !cancelled && setResult({ id, booking: bookings.find((b) => String(b.id) === id) ?? null }),
      (error) => !cancelled && setResult({ id, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);
  return result?.id === id ? result : null;
}

/** "Your booking": date, slot, party and seats on one line, with the icons of the My bookings card. */
function BookingSummary({ booking }) {
  const { slot } = booking;
  const seats = seatSplitText(booking.tables);
  const part = (Icon, text) => (
    <span className="d-inline-flex align-items-center gap-1">
      <Icon aria-hidden="true" size={18} className="flex-shrink-0" />
      {text}
    </span>
  );
  return (
    <section className="mb-4 p-3 rounded-3 border bg-body" aria-labelledby="change-booking-summary">
      <h2 id="change-booking-summary" className="h6 mb-2">
        Your booking
      </h2>
      <p className="d-flex flex-wrap column-gap-3 row-gap-1 mb-0">
        {part(CalendarDays, formatDate(slot.date))}
        {part(Clock, `${slot.label ? `${slot.label}, ` : ''}${formatTimeRange(slot.startTime, slot.endTime)}`)}
        {part(Users, peopleText(booking.partySize))}
        {seats && part(Armchair, seats)}
      </p>
    </section>
  );
}

const backToMyBookings = <Link to={routes.myBookings}>Back to My bookings</Link>;

/** No form: why, the booking (when there is one) and the way back. */
function CannotChange({ icon: Icon, message, booking }) {
  return (
    <>
      <p className="d-flex align-items-start gap-2">
        <Icon aria-hidden="true" size={20} className="flex-shrink-0 mt-1" />
        {message}
      </p>
      {booking && <BookingSummary booking={booking} />}
      {backToMyBookings}
    </>
  );
}

/** The booking's requirements as editor rows: the editor needs an id on each row (stripped before sending). */
const toRows = (requirements) => requirements.map((requirement, index) => ({ id: `saved-${index}`, ...requirement }));

/** Rows as the API wants them: no ids, trimmed descriptions. */
const toRequirements = (rows) =>
  rows.map(({ hasAllergies, description }) => ({ hasAllergies, description: description.trim() }));

const sameRequirements = (a, b) =>
  a.length === b.length &&
  a.every((r, i) => r.hasAllergies === b[i].hasAllergies && r.description.trim() === b[i].description.trim());

/** Only the fields that differ from the booking (numbers for slotId and partySize). */
function changesOf(booking, value, rows) {
  const change = {};
  if (value.slotId !== booking.slot.id) change.slotId = value.slotId;
  const partySize = Number(String(value.partySize).trim());
  if (partySize !== booking.partySize) change.partySize = partySize;
  const requirements = toRequirements(rows);
  if (!sameRequirements(requirements, booking.requirements ?? [])) change.requirements = requirements;
  return change;
}

function ChangeForm({ booking }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(() => ({
    date: booking.slot.date,
    slotId: booking.slot.id,
    partySize: String(booking.partySize),
  }));
  const [rows, setRows] = useState(() => toRows(booking.requirements ?? []));
  const [requirementSubmitAttempt, setRequirementSubmitAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [nothingToChange, setNothingToChange] = useState(false);
  const requirementsRef = useRef(null);
  const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
    useFormErrors(validateSlotPicker, FIELD_IDS);

  const change = changesOf(booking, value, rows);
  const changed = Object.keys(change).length > 0;
  // A refresh or closing the tab asks first while there are unsaved changes (not while saving: on success
  // the page leaves, and the warning goes with it).
  useUnsavedChangesWarning(changed && !submitting);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setNothingToChange(false);
    const slotPickerValid = checkOnSubmit(value);
    const requirementsValid = areRequirementsValid(rows);
    setRequirementSubmitAttempt((attempt) => attempt + 1);
    if (!slotPickerValid || !requirementsValid) {
      if (slotPickerValid && !requirementsValid) requirementsRef.current?.focusFirstEmptyDescription();
      return;
    }
    if (!changed) {
      setNothingToChange(true);
      return;
    }

    setSubmitting(true);
    try {
      await changeBooking(booking.id, change);
      // replace: Back from My bookings does not reopen the form of a booking already changed.
      navigate(routes.myBookings, { replace: true, state: { bookingChanged: true, bookingId: booking.id } });
    } catch (err) {
      if (err.status === 409) {
        setErrors({ slotId: `${err.message}. Choose another time.` });
        focusField('slotId');
      } else {
        showGeneralError(err.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <ErrorMessage message={generalError} ref={generalRef} />
      <BookingSummary booking={booking} />
      {/* noValidate: our checks run on submit instead of the browser's bubbles. */}
      <Form noValidate onSubmit={handleSubmit}>
        <SlotPicker
          idPrefix={ID_PREFIX}
          value={value}
          onChange={(next) => {
            setValue(next);
            setNothingToChange(false);
          }}
          errors={errors}
          onBlurField={(name) => recheck(name, value)}
          currentSlotId={booking.slot.id}
          minNoticeHours={MIN_NOTICE_HOURS}
        />
        <PartyRequirements
          ref={requirementsRef}
          value={rows}
          onChange={(next) => {
            setRows(next);
            setNothingToChange(false);
          }}
          submitAttempt={requirementSubmitAttempt}
        />
        {/* Status on the left, buttons on the right; at 360 px the status goes above the buttons. */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          <p role="status" className="flex-grow-1 d-flex align-items-center gap-2 mb-0 text-body-secondary">
            {nothingToChange && (
              <>
                <Info aria-hidden="true" size={18} className="flex-shrink-0" />
                Nothing to change
              </>
            )}
          </p>
          <div className="d-flex gap-3 ms-auto">
            <Link to={routes.myBookings} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
              <ArrowLeft aria-hidden="true" size={18} />
              Back
            </Link>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Form>
    </>
  );
}

export default function ChangeBookingPage() {
  const { id } = useParams();
  const result = useMyBooking(id);

  let content;
  if (!result) {
    content = <Loading />;
  } else if (result.error) {
    content = (
      <>
        <ErrorMessage message={result.error.message} />
        {backToMyBookings}
      </>
    );
  } else if (!result.booking) {
    content = <CannotChange icon={CircleAlert} message="This booking cannot be changed." />;
  } else if (result.booking.status === 'cancelled') {
    content = <CannotChange icon={Ban} message="A cancelled booking cannot be changed." booking={result.booking} />;
  } else if (!result.booking.changeable) {
    content = (
      <CannotChange
        icon={LockKeyhole}
        message="Changes close 48 hours before the meal."
        booking={result.booking}
      />
    );
  } else {
    content = <ChangeForm key={result.booking.id} booking={result.booking} />;
  }

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Change booking – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-4">Change booking</h1>
            {content}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
