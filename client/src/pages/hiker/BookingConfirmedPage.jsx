// MH-01 FE2 – Booking confirmed (hikers only). Reads GET /api/bookings/:id and shows the slot,
// the party size and the seat split (never table names, openapi Allocation).
// MH-03 FE1 adds the "email sent" line here (agreed exception to the file rule): see the marker below.
// 404 = unknown or someone else's booking (the server does not say which), 400 = id is not a number.
import { CalendarCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Link, useParams } from 'react-router';
import { getBooking } from '../../api/bookings.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Loading from '../../components/Loading.jsx';
import { routes } from '../../routes.js';
import { peopleText, seatSplitText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';

/** The booking of `id`: { booking } or { error }, once the answer for that id has arrived; else null. */
function useBooking(id) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getBooking(id).then(
      (booking) => !cancelled && setResult({ id, booking }),
      (err) => !cancelled && setResult({ id, error: err }),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);
  return result?.id === id ? result : null;
}

export default function BookingConfirmedPage() {
  const { id } = useParams();
  const result = useBooking(id);

  if (!result) return <Loading />;

  if (result.error) {
    const notFound = result.error.status === 404 || result.error.status === 400;
    return (
      <>
        <title>Booking not found – Mountain Hut</title>
        <h1>{notFound ? 'Booking not found' : 'Booking'}</h1>
        <ErrorMessage message={notFound ? 'This booking does not exist or is not yours.' : result.error.message} />
        <Link to={routes.book}>Book a table</Link>
      </>
    );
  }

  const { booking } = result;
  const { slot } = booking;
  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Booking confirmed – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <CalendarCheck aria-hidden="true" size={32} className="mh-card-icon" />
              <h1 className="mb-0">Booking confirmed</h1>
            </div>
            {/* role=status: screen readers announce the confirmation when the page opens. */}
            <p role="status" className="fs-5">
              Your table is booked. See you at the hut!
            </p>
            <dl className="row mb-0">
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
            {/* MH-03 FE1: "A confirmation email has been sent to …" goes here. */}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
