// Slot details card and table layout; used in the weekly schedule view.
// MH-10 FE1: the open card has "View menu" when the slot has a menu (onViewMenu(slot): the page shows it in a
// dialog), otherwise "No menu yet" and "Add menu" (onEditMenu(slot): the page opens the menu editor).
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import ListGroup from 'react-bootstrap/ListGroup';
import { formatTimeRange } from '../utils/format.js';

// A compact slot summary that expands its tables and menu within the same day section.
export default function SlotCard({ slot, isPastDay, expanded, onSelect, onViewMenu, onEditMenu }) {
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
          <div className="border-top mt-2 pt-2 px-2">
            {slot.menu ? (
              <Button variant="outline-primary" size="sm" className="w-100 text-nowrap" onClick={() => onViewMenu(slot)}>
                View menu
              </Button>
            ) : (
              <>
                <p className="small text-body-secondary mb-2">No menu yet</p>
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="w-100 text-nowrap"
                  onClick={() => onEditMenu(slot)}
                >
                  Add menu
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
