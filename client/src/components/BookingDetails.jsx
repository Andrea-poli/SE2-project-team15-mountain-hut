// The details of a booking as hikers and staff see them: date, time, party, seat split (never table names,
// openapi Allocation). Used by the booking confirmation (MH-01) and the staff reservation (MH-07).
// `children` are extra rows at the top (dt + dd pairs), e.g. the hiker on the staff page.
import { peopleText, seatSplitText } from '../utils/booking.js';
import { formatDate, formatTimeRange } from '../utils/format.js';

export default function BookingDetails({ booking, className = 'row mb-0', children }) {
  const { slot } = booking;
  return (
    <dl className={className}>
      {children}
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
  );
}
