// MH-04 FE1 – Check availability: is there room for a party in one slot? Public page, the same for everyone.
// The SlotPicker (MH-01 FE1) chooses date, time and party size; Check → GET /api/public/slots/:id/availability.
// The result (contract in test/unit/pages/CheckAvailabilityPage.test.jsx, PO issue #12):
// - available: "Available" and the seat split ("2 + 3 + 1 seats", never table names), then, by role
//   (team decision, 3 Nov): hiker → "Book this table" (Book page prefilled); guest → "Log in or register
//   to book" (back to the prefilled Book page after login); staff → nothing (staff do not book online);
// - not available: "Not available", no link and no alternative slots (PO: the user checks another slot);
// - any change to the form removes the result, which would no longer match it.
// The result is a card (✓ green / ✕ grey dashed) with the slot checked; its text is in a role="status" region
// that is always in the page, so screen readers announce it. The form values go in the URL
// (?date=&slotId=&partySize=, like the Book page) at every change, so a refresh keeps them.
import { CalendarPlus, CircleCheck, CircleX, LogIn, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { Link, useSearchParams } from 'react-router';
import { checkAvailability } from '../../api/availability.js';
import { listPublicSlots } from '../../api/publicSlots.js';
import { hasRole } from '../../auth/roles.js';
import { useAuth } from '../../auth/useAuth.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { peopleText, seatSplitText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import {
  slotPickerFieldIds,
  slotPickerValueFromParams,
  slotPickerValueToParams,
  validateSlotPicker,
} from '../../utils/slotPicker.js';

const ID_PREFIX = 'check';
const FIELD_IDS = slotPickerFieldIds(ID_PREFIX);

/**
 * What comes after "Available", by role: the Book page link, the login link, or nothing for staff.
 * Real links styled as buttons (react-bootstrap's Button as={Link} would give them role="button").
 */
function NextStep({ checked }) {
  const { user, loading } = useAuth();
  if (loading || hasRole(user, ['employee'])) return null;
  const bookUrl = `${routes.book}?${slotPickerValueToParams(checked)}`;
  if (user?.role === 'hiker') {
    return (
      <Link to={bookUrl} className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
        <CalendarPlus aria-hidden="true" size={18} />
        Book this table
      </Link>
    );
  }
  return (
    <Link
      to={`${routes.login}?next=${encodeURIComponent(bookUrl)}`}
      className="btn btn-outline-primary w-100 d-flex align-items-center justify-content-center gap-2"
    >
      <LogIn aria-hidden="true" size={18} />
      Log in or register to book
    </Link>
  );
}

export default function CheckAvailabilityPage() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(() => slotPickerValueFromParams(params));
  // { checked: the form value it answers, slot: the slot checked (or null), available, split } or null.
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const { errors, generalError, generalRef, checkOnSubmit, recheck, showGeneralError } = useFormErrors(
    validateSlotPicker,
    FIELD_IDS,
  );
  // Number of the latest check: an answer that arrives after the form changed is ignored.
  const latest = useRef(0);

  function change(next) {
    latest.current += 1;
    setValue(next);
    setResult(null);
    setParams(slotPickerValueToParams(next), { replace: true }); // a refresh keeps the values, also half filled
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (checking || !checkOnSubmit(value)) return;

    const request = ++latest.current;
    const checked = value;
    setChecking(true);
    setResult(null);
    try {
      // The slot's label and times for the card: the same list the SlotPicker loads (only the day checked).
      const [answer, slot] = await Promise.all([
        checkAvailability(checked.slotId, Number(checked.partySize)),
        listPublicSlots(checked.date).then(
          (slots) => slots.find((s) => s.id === checked.slotId) ?? null,
          () => null, // without it the card just has no slot line
        ),
      ]);
      if (request === latest.current) setResult({ checked, slot, ...answer });
    } catch (err) {
      if (request === latest.current) showGeneralError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Check availability – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-2">Check availability</h1>
            <p className="mb-4">Choose a day, a meal and the number of people to see if there is room.</p>
            <ErrorMessage message={generalError} ref={generalRef} />
            {/* noValidate: our checks run on submit instead of the browser's bubbles. */}
            <Form noValidate onSubmit={handleSubmit}>
              <SlotPicker
                idPrefix={ID_PREFIX}
                value={value}
                onChange={change}
                errors={errors}
                onBlurField={(name) => recheck(name, value)}
              />
              <Button
                type="submit"
                className="w-100 mt-2 d-flex align-items-center justify-content-center gap-2"
                disabled={checking}
              >
                <Search aria-hidden="true" size={18} />
                {checking ? 'Checking…' : 'Check'}
              </Button>
            </Form>

            {/* Always in the page, so the result is announced; the border appears with a result. */}
            <div
              className={
                result ? `mt-4 p-3 border rounded-3 border-${result.available ? 'success' : 'secondary'}` : 'mt-4'
              }
              style={result && !result.available ? { borderStyle: 'dashed' } : undefined}
            >
              <div role="status">
                {result && (
                  <>
                    <p className="d-flex align-items-center gap-2 fs-5 fw-semibold mb-1">
                      {result.available ? (
                        <CircleCheck aria-hidden="true" size={24} className="text-success flex-shrink-0" />
                      ) : (
                        <CircleX aria-hidden="true" size={24} className="text-secondary flex-shrink-0" />
                      )}
                      {result.available ? 'Available' : 'Not available'} for{' '}
                      {peopleText(Number(result.checked.partySize))}
                    </p>
                    {result.slot && (
                      <p className="text-body-secondary mb-1">
                        {result.slot.label} · {formatDate(result.checked.date)} ·{' '}
                        {formatTimeRange(result.slot.startTime, result.slot.endTime)}
                      </p>
                    )}
                    <p className="mb-0">
                      {result.available ? (
                        <>
                          Seating: <strong>{seatSplitText(result.split)}</strong>
                        </>
                      ) : (
                        'You can check another day or time.'
                      )}
                    </p>
                  </>
                )}
              </div>
              {result?.available && (
                <div className="mt-3">
                  <NextStep checked={result.checked} />
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
