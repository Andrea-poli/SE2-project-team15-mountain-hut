// MH-01 FE2 – Book a table (hikers only: the router puts the page behind RequireRole).
// The SlotPicker (MH-01 FE1) is prefilled from the URL (?date=&slotId=&partySize=), e.g. from MH-04's
// "Book this table" link. Confirm → POST /api/bookings → the confirmation page of the new booking.
// Server refusals are shown where they belong:
// - 409 (seats taken meanwhile, or already booked this slot) and 400 (closed / less than 2 h):
//   on the time field, so the hiker picks another time;
// - 404 (slot removed) and network errors: one general message above the form.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { generatePath, useNavigate, useSearchParams } from 'react-router';
import { createBooking } from '../../api/bookings.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import SlotPicker from '../../components/SlotPicker.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { slotPickerFieldIds, slotPickerValueFromParams, validateSlotPicker } from '../../utils/slotPicker.js';

const ID_PREFIX = 'book';
const FIELD_IDS = slotPickerFieldIds(ID_PREFIX);

export default function BookPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [value, setValue] = useState(() => slotPickerValueFromParams(params));
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
    useFormErrors(validateSlotPicker, FIELD_IDS);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit(value)) return;

    setSubmitting(true);
    try {
      const booking = await createBooking({ slotId: value.slotId, partySize: Number(value.partySize) });
      // replace: Back from the confirmation does not reopen the filled form (no double booking).
      navigate(generatePath(routes.bookingConfirmed, { id: booking.id }), { replace: true });
    } catch (err) {
      if (err.status === 409 || err.status === 400) {
        setErrors({ slotId: `${err.message}. Choose another time.` });
        focusField('slotId');
      } else {
        showGeneralError(err.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Book a table – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-2">Book a table</h1>
            <p className="mb-4">Bookings close 2 hours before the meal starts.</p>
            <ErrorMessage message={generalError} ref={generalRef} />
            {/* noValidate: our checks run on submit instead of the browser's bubbles. */}
            <Form noValidate onSubmit={handleSubmit}>
              <SlotPicker
                idPrefix={ID_PREFIX}
                value={value}
                onChange={setValue}
                errors={errors}
                onBlurField={(name) => recheck(name, value)}
              />
              <Button type="submit" className="w-100 mt-2" disabled={submitting}>
                {submitting ? 'Booking…' : 'Confirm booking'}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
