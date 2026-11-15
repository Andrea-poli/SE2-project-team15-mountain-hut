// MH-07 FE2 – New reservation (staff): who (HikerPanel), when and how many (SlotPicker, open until the slot
// starts: staff have no 2-hour rule, PO #35), then POST /api/staff/bookings (openapi createStaffBooking).
// The confirmation shows the booking as the hiker's confirmation page does, plus the password generated for
// a new hiker, shown once, for the employee to give to the hiker (PO #36).
// Server refusals where they belong: "Email already in use" on Email, "Hiker not found" on Search, seats,
// already booked and started on Time; anything else above the form.
// MH-05 FE1: the party requirements editor goes under the party size once merged; until then the booking is
// sent with no requirements.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { CalendarCheck, KeyRound } from 'lucide-react';
import { Link } from 'react-router';
import { createStaffBooking } from '../../api/staff.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import HikerPanel from '../../components/HikerPanel.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { peopleText, seatSplitText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import { EMPTY_HIKER, hikerPanelFieldIds, hikerSummaryText, staffBookingHiker, validateHiker } from
  '../../utils/hikerPanel.js';
import { slotPickerFieldIds, validateSlotPicker } from '../../utils/slotPicker.js';

const ID_PREFIX = 'staff-book';
const EMPTY_SLOT = { date: '', slotId: null, partySize: '' };
const SLOT_FIELDS = ['date', 'slotId', 'partySize'];

const validate = ({ hiker, slot }) => ({ ...validateHiker(hiker), ...validateSlotPicker(slot) });

/** The field a server refusal belongs to, or null for a general message. */
function errorField(err, mode) {
  if (err.status === 409 && err.message === 'Email already in use' && mode === 'new') return 'email';
  if (err.status === 404 && err.message === 'Hiker not found' && mode === 'existing') return 'hikerId';
  if (err.status === 409 || err.message === 'This slot has already started') return 'slotId';
  return null;
}

export default function StaffReservationPage() {
  const [hiker, setHiker] = useState(EMPTY_HIKER);
  const [slot, setSlot] = useState(EMPTY_SLOT);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const fieldIds = { ...hikerPanelFieldIds(ID_PREFIX, hiker.mode), ...slotPickerFieldIds(ID_PREFIX) };
  const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
    useFormErrors(validate, fieldIds);

  function changeHiker(next) {
    // Another mode has other fields: its old errors would show under the wrong ones.
    if (next.mode !== hiker.mode) {
      setErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => SLOT_FIELDS.includes(k))));
    }
    setHiker(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit({ hiker, slot })) return;

    setSubmitting(true);
    try {
      setBooking(
        await createStaffBooking({
          ...staffBookingHiker(hiker),
          slotId: slot.slotId,
          partySize: Number(slot.partySize),
          requirements: [],
        }),
      );
    } catch (err) {
      const field = errorField(err, hiker.mode);
      if (field) {
        setErrors({ [field]: field === 'slotId' ? `${err.message}. Choose another time.` : err.message });
        focusField(field);
      } else {
        showGeneralError(err.message);
      }
    }
    setSubmitting(false);
  }

  function startOver() {
    setBooking(null);
    setHiker(EMPTY_HIKER);
    setSlot(EMPTY_SLOT);
    setErrors({});
  }

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        {booking ? (
          <Confirmation booking={booking} onStartOver={startOver} />
        ) : (
          <Card>
            <title>New reservation – Mountain Hut</title>
            <Card.Body className="p-4">
              <h1 className="mb-2">New reservation</h1>
              <p className="mb-4">For bookings by phone or at the hut. Staff can book a slot until it starts.</p>
              <ErrorMessage message={generalError} ref={generalRef} />
              <Form noValidate onSubmit={handleSubmit}>
                <HikerPanel
                  idPrefix={ID_PREFIX}
                  value={hiker}
                  onChange={changeHiker}
                  errors={errors}
                  onBlurField={(name) => recheck(name, { hiker, slot })}
                />
                <fieldset className="mb-2">
                  <legend className="h5">Table</legend>
                  <SlotPicker
                    idPrefix={ID_PREFIX}
                    value={slot}
                    onChange={setSlot}
                    errors={errors}
                    onBlurField={(name) => recheck(name, { hiker, slot })}
                    untilStart
                  />
                </fieldset>
                <Button type="submit" className="w-100 mt-2" disabled={submitting}>
                  {submitting ? 'Booking…' : 'Confirm reservation'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        )}
      </Col>
    </Row>
  );
}

function Confirmation({ booking, onStartOver }) {
  const { hiker, slot, generatedPassword } = booking;
  const name = [hiker.firstName, hiker.lastName].filter(Boolean).join(' ');
  return (
    <Card>
      <title>Reservation confirmed – Mountain Hut</title>
      <Card.Body className="p-4">
        <div className="d-flex align-items-center gap-2 mb-3">
          <CalendarCheck aria-hidden="true" size={32} className="mh-card-icon" />
          <h1 className="mb-0">Reservation confirmed</h1>
        </div>
        <p role="status">The table is booked for {name}.</p>
        <dl className="row mb-3">
          <dt className="col-sm-4">Hiker</dt>
          <dd className="col-sm-8">{hikerSummaryText(hiker)}</dd>
          <dt className="col-sm-4">Date</dt>
          <dd className="col-sm-8">{formatDate(slot.date)}</dd>
          <dt className="col-sm-4">Time</dt>
          <dd className="col-sm-8">
            {slot.label ? `${slot.label}, ` : ''}
            {formatTimeRange(slot.startTime, slot.endTime)}
          </dd>
          <dt className="col-sm-4">Party</dt>
          <dd className="col-sm-8">{peopleText(booking.partySize)}</dd>
          <dt className="col-sm-4">Seating</dt>
          <dd className="col-sm-8">{seatSplitText(booking.tables)}</dd>
        </dl>
        {generatedPassword && <PasswordBox password={generatedPassword} />}
        <div className="d-flex flex-wrap gap-2">
          <Button type="button" onClick={onStartOver}>
            New reservation
          </Button>
          <Link to={routes.staffSlots} className="btn btn-outline-primary">
            Back to slots
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
}

/** The password of a new hiker: shown once, to be given to the hiker, who changes it at the first login. */
function PasswordBox({ password }) {
  const [copied, setCopied] = useState(false);
  const canCopy = Boolean(navigator.clipboard?.writeText); // not available outside https/localhost
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="p-3 rounded-3 border border-warning-subtle bg-warning-subtle mb-3" aria-labelledby="pw-title">
      <h2 id="pw-title" className="h6 d-flex align-items-center gap-2">
        <KeyRound aria-hidden="true" size={20} />
        Password for the new hiker
      </h2>
      <p className="mb-2">
        <code className="fs-5 text-body user-select-all">{password}</code>
      </p>
      <p className="small mb-2">
        Shown only now: give it to the hiker. They must change it the first time they log in.
      </p>
      {canCopy && (
        <Button type="button" size="sm" variant="outline-dark" onClick={copy}>
          Copy password
        </Button>
      )}
      <span role="status" className="small ms-2">
        {copied ? 'Copied' : ''}
      </span>
    </section>
  );
}
