// Slot details card and table layout; used in the weekly schedule view.
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import Card from 'react-bootstrap/Card';
import ListGroup from 'react-bootstrap/ListGroup';
import { formatTimeRange } from '../utils/format.js';

// A compact slot summary that expands its tables within the same day section.
export default function SlotCard({ slot, isPastDay, expanded, onSelect }) {
  const seatCount = slot.tables.reduce((total, table) => total + table.seats, 0);
  const tableCount = slot.tables.length;
  const detailsId = `slot-details-${slot.id}`;
  const isPast = isPastDay || slot.past; // the day is over, or the slot has started

  return (
    <Card className={`mh-slot-card${isPast ? ' mh-slot-card-past' : ''}`}>
      <button
        type="button"
        className="btn btn-light position-relative d-flex w-100 flex-column align-items-start p-2 text-start"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => onSelect(slot)}
      >
        <span className="mh-slot-card-line mh-slot-card-name" title={slot.label}>{slot.label}</span>
        <span className="d-flex align-items-center gap-2 mw-100">
          <span className="mh-slot-card-line">{formatTimeRange(slot.startTime, slot.endTime)}</span>
          {isPast && (
            <span className="mh-past-label d-inline-flex align-items-center gap-1 flex-shrink-0">
              <Clock aria-hidden="true" size={12} />
              Past
            </span>
          )}
        </span>
        <span className="mh-slot-card-line">{tableCount} {tableCount === 1 ? 'table' : 'tables'}</span>
        <span className="mh-slot-card-line mh-slot-card-last-line">{seatCount} {seatCount === 1 ? 'seat' : 'seats'}</span>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={16} className="position-absolute bottom-0 end-0 m-2" />
        ) : (
          <ChevronDown aria-hidden="true" size={16} className="position-absolute bottom-0 end-0 m-2" />
        )}
      </button>
      {expanded && (
        <div id={detailsId} className="px-2 pb-2">
          <ListGroup variant="flush">
            {slot.tables.map((table) => (
              <ListGroup.Item key={table.id} className="d-flex justify-content-between gap-3 px-2">
                <span>{table.name} – {table.seats} {table.seats === 1 ? 'seat' : 'seats'}</span>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </div>
      )}
    </Card>
  );
}
