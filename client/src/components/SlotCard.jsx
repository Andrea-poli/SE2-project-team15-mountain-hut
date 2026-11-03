// Slot details card and table layout; used in the weekly schedule view.
import Card from 'react-bootstrap/Card';
import ListGroup from 'react-bootstrap/ListGroup';
import { formatDate, formatTimeRange } from '../utils/format.js';

// A compact selectable summary; detailed table information is shown below the week grid.
export default function SlotCard({ slot, isPastDay, selected, onSelect }) {
  const seatCount = slot.tables.reduce((total, table) => total + table.seats, 0);
  const tableCount = slot.tables.length;

  return (
    <Card className={`mh-slot-card${isPastDay ? ' mh-slot-card-past' : ''}${selected ? ' border-primary' : ''}`}>
      <button
        type="button"
        className="btn btn-light d-flex w-100 flex-column align-items-start p-2 text-start"
        aria-pressed={selected}
        onClick={() => onSelect(slot)}
      >
        <span className="mh-slot-card-line mh-slot-card-name" title={slot.label}>{slot.label}</span>
        <span className="mh-slot-card-line">{formatTimeRange(slot.startTime, slot.endTime)}</span>
        <span className="mh-slot-card-line">{tableCount} {tableCount === 1 ? 'table' : 'tables'}</span>
        <span className="mh-slot-card-line">{seatCount} {seatCount === 1 ? 'seat' : 'seats'}</span>
      </button>
    </Card>
  );
}

// Show the selected slot's full table layout below the weekly schedule.
export function SlotDetails({ slot }) {
  return (
    <Card className="mh-slot-details mt-4" aria-labelledby="selected-slot-title">
      <Card.Body>
        <h2 id="selected-slot-title" className="h4">{slot.label} tables</h2>
        <p className="mb-3">
          {formatDate(slot.date)} · {formatTimeRange(slot.startTime, slot.endTime)}
        </p>
        <ListGroup variant="flush">
          {slot.tables.map((table) => (
            <ListGroup.Item key={table.id} className="d-flex justify-content-between gap-3">
              <span>{table.name}</span>
              <span>{table.seats} {table.seats === 1 ? 'seat' : 'seats'}</span>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card.Body>
    </Card>
  );
}
