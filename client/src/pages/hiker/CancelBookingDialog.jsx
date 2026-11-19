// MH-08 FE1 – "Cancel this booking?" dialog of My bookings. POST /api/bookings/:id/cancel, allowed at any time
// (PO issue #8). "Keep it", Escape and the close button change nothing. While sending the dialog cannot be closed.
// Errors stay in the dialog (focused): 409 (already cancelled, e.g. in another tab) and 404 (gone) mean the list
// is out of date, so the page reloads it (onStale) and "Yes, cancel booking" is disabled; any other error can be
// tried again. The page mounts the dialog only while it is open, so it starts fresh each time.
// onCancelled(booking) receives the booking returned by the server (status cancelled).
import { CalendarDays, CircleX, Clock, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { cancelBooking } from '../../api/bookings.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { peopleText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';

export default function CancelBookingDialog({ booking, onHide, onCancelled, onStale }) {
  const titleId = `${useId()}-title`;
  const { slot } = booking;
  const [sending, setSending] = useState(false);
  // The error of the last try ({ message }: a new object each time, so the same message is focused again).
  const [error, setError] = useState(null);
  // 409 / 404: the booking is already cancelled or gone, so trying again cannot work.
  const [stale, setStale] = useState(false);
  const errorRef = useRef(null);

  // Once the error is on screen, move the focus to it so screen readers read it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function confirm() {
    if (sending || stale) return;
    setSending(true);
    setError(null);
    try {
      onCancelled(await cancelBooking(booking.id));
    } catch (err) {
      setSending(false);
      setError({ message: err.message });
      if (err.status === 409 || err.status === 404) {
        setStale(true);
        onStale();
      }
    }
  }

  return (
    // While sending, Escape, the backdrop and the close button do not close the dialog. The page moves the focus
    // itself when the dialog closes (back to "Cancel booking", or to the message after a cancel).
    <Modal show centered restoreFocus={false} onHide={() => !sending && onHide()} aria-labelledby={titleId}>
      <Modal.Header closeButton={!sending}>
        <Modal.Title as="h2" id={titleId} className="h4">
          Cancel this booking?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ErrorMessage message={error?.message} ref={errorRef} />
        <div className="d-grid gap-1 mb-3">
          <div className="d-flex align-items-start gap-2 fw-semibold">
            <CalendarDays aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
            {formatDate(slot.date)}
          </div>
          <div className="d-flex align-items-start gap-2">
            <Clock aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
            <span>
              {slot.label ? `${slot.label}, ` : ''}
              {formatTimeRange(slot.startTime, slot.endTime)}
            </span>
          </div>
          <div className="d-flex align-items-start gap-2">
            <Users aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
            {peopleText(booking.partySize)}
          </div>
        </div>
        <p className="d-flex align-items-start gap-2 mb-0 text-warning-emphasis">
          <TriangleAlert aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
          Your seats will be freed for other hikers. This cannot be undone.
        </p>
      </Modal.Body>
      <Modal.Footer className="flex-wrap">
        {/* autoFocus: the safe choice has the focus when the dialog opens. */}
        <Button variant="outline-secondary" disabled={sending} onClick={onHide} autoFocus>
          Keep it
        </Button>
        <Button
          variant="danger"
          className="d-inline-flex align-items-center gap-2"
          disabled={sending || stale}
          onClick={confirm}
        >
          <CircleX aria-hidden="true" size={18} />
          {sending ? 'Cancelling…' : 'Yes, cancel booking'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
