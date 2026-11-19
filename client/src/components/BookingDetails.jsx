// The details of a booking as hikers and staff see them: date, time, party, seat split (never table names,
// openapi Allocation). Used by the booking confirmation (MH-01) and the staff reservation (MH-07).
// `children` are extra rows at the top (dt + dd pairs), e.g. the hiker on the staff page.
// Each term has the decorative icon of the same data elsewhere (My bookings, Change booking): I2, issue #39.
import { Armchair, CalendarDays, Clock, Users } from 'lucide-react';
import { peopleText, seatSplitText } from '../utils/booking.js';
import { formatDate, formatTimeRange } from '../utils/format.js';

/** A term with its icon (aria-hidden: screen readers read the text only). */
function Term({ icon: Icon, children }) {
  return (
    <dt className="col-sm-4 d-flex align-items-center gap-2">
      <Icon aria-hidden="true" size={18} className="flex-shrink-0" />
      {children}
    </dt>
  );
}

export default function BookingDetails({ booking, className = 'row mb-0', children }) {
  const { slot } = booking;
  return (
    <dl className={className}>
      {children}
      <Term icon={CalendarDays}>Date</Term>
      <dd className="col-sm-8">{formatDate(slot.date)}</dd>
      <Term icon={Clock}>Time</Term>
      <dd className="col-sm-8">
        {slot.label ? `${slot.label}, ` : ''}
        {formatTimeRange(slot.startTime, slot.endTime)}
      </dd>
      <Term icon={Users}>Party</Term>
      <dd className="col-sm-8">{peopleText(booking.partySize)}</dd>
      <Term icon={Armchair}>Seating</Term>
      <dd className="col-sm-8">{seatSplitText(booking.tables)}</dd>
    </dl>
  );
}
