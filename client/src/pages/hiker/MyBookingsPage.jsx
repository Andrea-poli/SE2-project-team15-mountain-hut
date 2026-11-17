// MH-06 FE1 – My bookings (hikers only). Reads GET /api/bookings and shows one card per booking, in the
// server's order (upcoming first, then past). Each card: date, slot, party, seat split (never table names,
// openapi Allocation) and requirements (MH-05). The server says which bookings can be changed (`changeable`,
// the 48-hour window of PO issue #43), so the page never repeats that rule.
// Two sections, "Upcoming" (not started yet, confirmed or cancelled) and "Past bookings" (already started).
// The whole list is shown PAGE_SIZE bookings at a time, in the server's order.
// After a change, ChangeBookingPage (FE2) comes back here with router state { bookingChanged: true, bookingId }:
// a message (focused) and the changed card highlighted; the state is cleared, so a refresh shows neither.
import {
  Armchair,
  Ban,
  CalendarArrowLeft,
  CalendarArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  CircleCheck,
  Clock,
  LockKeyhole,
  Pencil,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { generatePath, Link, useLocation, useNavigate } from 'react-router';
import { listMyBookings } from '../../api/bookings.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Loading from '../../components/Loading.jsx';
import { routes } from '../../routes.js';
import { peopleText, seatSplitText } from '../../utils/booking.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';
import './MyBookingsPage.css';

// Bookings shown at first, and added by each "Show more".
const PAGE_SIZE = 10;

/** True once the slot has started: its start is at or before now (openapi, slot time rules). */
function hasStarted({ date, startTime }, now) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime() <= now;
}

/** Requirements as on the confirmation page (same badges), without a list: each card is already a list item. */
function Requirements({ requirements }) {
  if (requirements.length === 0) return null;
  return (
    <div className="d-grid gap-1 mt-2">
      {requirements.map((requirement, index) => (
        <div key={index} className="d-flex align-items-start gap-2">
          <span
            className={`badge rounded-pill d-inline-flex align-items-center gap-1 mt-1 ${
              requirement.hasAllergies ? 'mh-requirement-allergy-badge' : 'bg-secondary-subtle text-body'
            }`}
          >
            {requirement.hasAllergies && <TriangleAlert aria-hidden="true" size={14} />}
            {requirement.hasAllergies ? 'Allergies' : 'Diet'}
          </span>
          <span className="text-break">{requirement.description}</span>
        </div>
      ))}
    </div>
  );
}

// `changed`: the booking just changed (MH-06 FE2): a highlight that fades, and a "Changed" label.
function BookingCard({ booking, past, changed, itemRef }) {
  const { id, slot } = booking;
  const cancelled = booking.status === 'cancelled';
  const headingId = `booking-${id}-date`;
  const timeId = `booking-${id}-time`;
  const seats = seatSplitText(booking.tables);

  return (
    // tabIndex -1: "Show more" moves the focus to the first new card (not in the Tab order).
    <li
      ref={itemRef}
      tabIndex={-1}
      className={`card mh-booking${cancelled || past ? ' mh-booking-inactive' : ''}${changed ? ' mh-booking-changed' : ''}`}
    >
      <div className="card-body d-flex flex-wrap align-items-end justify-content-between gap-3">
        <div className="flex-grow-1">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <h3 id={headingId} className="h5 d-flex align-items-center gap-2 mb-0">
              <CalendarDays aria-hidden="true" size={20} className="flex-shrink-0" />
              {formatDate(slot.date)}
            </h3>
            {changed && (
              <span className="mh-booking-label mh-booking-label-changed">
                <Pencil aria-hidden="true" size={14} />
                Changed
              </span>
            )}
            {cancelled ? (
              <span className="mh-booking-label mh-booking-label-cancelled">
                <Ban aria-hidden="true" size={14} />
                Cancelled
              </span>
            ) : (
              past && (
                <span className="mh-booking-label">
                  <Clock aria-hidden="true" size={14} />
                  Past
                </span>
              )
            )}
          </div>
          <div className="d-grid gap-1">
            <div id={timeId} className="d-flex align-items-start gap-2">
              <Clock aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
              <span>
                {slot.label ? `${slot.label}, ` : ''}
                {formatTimeRange(slot.startTime, slot.endTime)}
              </span>
            </div>
            <div className="d-flex align-items-start gap-2">
              <Users aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
              <span>{peopleText(booking.partySize)}</span>
            </div>
            {seats && (
              <div className="d-flex align-items-start gap-2">
                <Armchair aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
                <span>{seats}</span>
              </div>
            )}
          </div>
          <Requirements requirements={booking.requirements ?? []} />
        </div>
        {/* Actions. MH-08 adds "Cancel" here, next to "Change". */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          {booking.changeable ? (
            // aria-describedby: screen readers hear which booking each "Change" is for.
            <Link
              to={generatePath(routes.changeBooking, { id })}
              className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
              aria-describedby={`${headingId} ${timeId}`}
            >
              <Pencil aria-hidden="true" size={18} />
              Change
            </Link>
          ) : (
            !cancelled &&
            !past && (
              <p className="d-flex align-items-start gap-2 mb-0 text-body-secondary">
                <LockKeyhole aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
                Changes close 48 hours before the meal
              </p>
            )
          )}
        </div>
      </div>
    </li>
  );
}

export default function MyBookingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Kept in the page: the router state is cleared below, so a reload does not show it again.
  const [bookingChanged, setBookingChanged] = useState(() => location.state?.bookingChanged === true);
  const [changedId] = useState(() => (location.state?.bookingChanged ? location.state.bookingId : null));
  const [result, setResult] = useState(null); // { bookings, loadedAt } or { error }
  const [shown, setShown] = useState(PAGE_SIZE);
  const itemRefs = useRef(new Map());
  const changedRef = useRef(null);
  const headingRef = useRef(null);

  // Arriving after a change: the focus goes to the message, so screen readers read it.
  // Only on arrival: closing the message must not run this again.
  useEffect(() => {
    if (changedRef.current) changedRef.current.focus();
  }, []);

  /** Closes "Booking changed"; the focus, which was on its close button, goes to the page heading. */
  function closeMessage() {
    setBookingChanged(false);
    setTimeout(() => headingRef.current?.focus());
  }

  useEffect(() => {
    if (location.state?.bookingChanged) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    listMyBookings().then(
      // "Past" is decided at the time of the answer, like the server's order.
      (bookings) => !cancelled && setResult({ bookings, loadedAt: Date.now() }),
      (error) => !cancelled && setResult({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Server order kept (upcoming first): the first `shown` bookings of the whole list, split by section.
  const bookings = (result?.bookings ?? []).map((booking) => ({
    booking,
    past: hasStarted(booking.slot, result.loadedAt),
  }));
  const visible = bookings.slice(0, shown);
  const upcoming = visible.filter(({ past }) => !past);
  const past = visible.filter(({ past }) => past);
  const firstHidden = bookings[shown];

  function showMore() {
    const firstNew = firstHidden.booking.id;
    setShown((count) => count + PAGE_SIZE);
    // After the render that shows the new cards, move the focus to the first one.
    setTimeout(() => itemRefs.current.get(firstNew)?.focus());
  }

  const bookTableLink = (
    <Link to={routes.book} className="btn btn-primary d-inline-flex align-items-center gap-2">
      <CalendarPlus aria-hidden="true" size={18} />
      Book a table
    </Link>
  );

  /** One section with its own list; `empty` replaces the list when there is nothing in it. */
  function section(key, Icon, heading, items, empty) {
    const headingId = `my-bookings-${key}`;
    return (
      <section className="mb-4" aria-labelledby={headingId}>
        <h2 id={headingId} className="h4 d-flex align-items-center gap-2 mb-3">
          <Icon aria-hidden="true" size={24} className="mh-card-icon" />
          {heading}
        </h2>
        {items.length > 0 ? (
          <ul className="list-unstyled d-grid gap-3 mb-0">
            {items.map(({ booking, past: isPast }) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                past={isPast}
                changed={booking.id === changedId}
                itemRef={(node) => {
                  if (node) itemRefs.current.set(booking.id, node);
                  else itemRefs.current.delete(booking.id);
                }}
              />
            ))}
          </ul>
        ) : (
          empty
        )}
      </section>
    );
  }

  let content;
  if (!result) {
    content = <Loading />;
  } else if (result.error) {
    content = <ErrorMessage message={result.error.message} />;
  } else if (bookings.length === 0) {
    content = (
      <>
        <p>You have no bookings yet</p>
        {bookTableLink}
      </>
    );
  } else {
    // Upcoming bookings come first, so "Upcoming" is empty only when the hiker has none at all.
    content = (
      <>
        {section(
          'upcoming',
          CalendarArrowRight,
          'Upcoming',
          upcoming,
          <>
            <p>No upcoming bookings</p>
            {bookTableLink}
          </>,
        )}
        {past.length > 0 && section('past', CalendarArrowLeft, 'Past bookings', past)}
        {firstHidden && (
          <Button variant="outline-primary" className="d-inline-flex align-items-center gap-2" onClick={showMore}>
            <ChevronDown aria-hidden="true" size={18} />
            Show more
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <title>My bookings – Mountain Hut</title>
      {/* tabIndex -1: the focus comes here when "Booking changed" is closed. */}
      <h1 ref={headingRef} tabIndex={-1}>
        My bookings
      </h1>
      {bookingChanged && (
        <Alert
          ref={changedRef}
          tabIndex={-1}
          variant="success"
          role="status"
          dismissible
          closeLabel="Close"
          onClose={closeMessage}
          className="d-flex align-items-center gap-2"
        >
          <CircleCheck aria-hidden="true" size={20} className="flex-shrink-0" />
          Booking changed. We sent you an email with the new details.
        </Alert>
      )}
      {content}
    </>
  );
}
