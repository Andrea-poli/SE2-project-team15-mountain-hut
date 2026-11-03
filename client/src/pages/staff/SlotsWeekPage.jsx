// MH-02 FE1 – Slots view (staff only). Reads GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD and displays a weekly
// schedule with a compact summary of each slot. Selecting a slot shows its full table layout below the week grid.
// The week can be navigated with previous/next buttons, past and current day are distinguished.
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import { Link } from 'react-router';
import Spinner from 'react-bootstrap/Spinner';
import { listSlots } from '../../api/slots.js';
import SlotCard from '../../components/SlotCard.jsx';
import './SlotsWeekPage.css';
import { routes } from '../../routes.js';
import {
  addDays,
  formatDate,
  formatWeekRange,
  startOfWeek,
  toLocalIsoDate,
} from '../../utils/format.js';

export default function SlotsWeekPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);
  const from = toLocalIsoDate(weekStart);
  const to = toLocalIsoDate(weekEnd);
  const rangeKey = `${from}:${to}`;
  const todayDate = toLocalIsoDate(new Date());
  const [slotResult, setSlotResult] = useState({ rangeKey: null, slots: [], error: null });
  const [loadedRange, setLoadedRange] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  // Fetch slots for the current week whenever the range changes.
  useEffect(() => {
    let cancelled = false;
    listSlots(from, to)
      .then((slots) => {
        if (!cancelled) {
          setSlotResult({ rangeKey, slots, error: null });
          setLoadedRange(rangeKey);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSlotResult({ rangeKey, slots: [], error: error.message });
          setLoadedRange(rangeKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [from, rangeKey, to]);

  const loading = loadedRange !== rangeKey;
  const error = slotResult.rangeKey === rangeKey ? slotResult.error : null;
  const slots = slotResult.rangeKey === rangeKey ? slotResult.slots : [];
  const canShowWeek = !loading && !error;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const isoDate = toLocalIsoDate(date);
    return {
      isoDate,
      slots: slots.filter((slot) => slot.date === isoDate),
      isToday: isoDate === todayDate,
      isPast: isoDate < todayDate,
    };
  });
  const hasSlots = days.some((day) => day.slots.length > 0);

  function moveWeek(amount) {
    setSelectedSlotId(null);
    setWeekStart((date) => addDays(date, amount));
  }

  return (
    <>
      <title>Slots of the week – Mountain Hut</title>
      <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
        <h1 className="mb-0">Slots of the week</h1>
        <div className="d-flex flex-wrap align-items-center justify-content-center gap-3">
          <nav className="d-flex flex-nowrap align-items-center justify-content-center gap-2" aria-label="Week navigation">
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Previous week"
              onClick={() => moveWeek(-7)}
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </Button>
            <p className="mh-week-range mb-0 flex-grow-1 text-center fw-semibold" aria-live="polite">
              {formatWeekRange(weekStart, weekEnd)}
            </p>
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Next week"
              onClick={() => moveWeek(7)}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </Button>
          </nav>
          <Link to={routes.newSlot} className="btn btn-primary">
            New Slot
          </Link>
        </div>
      </div>

      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {loading && (
        <div className="d-flex align-items-center gap-2 mb-4" role="status">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>Loading slots…</span>
        </div>
      )}
      {canShowWeek && !hasSlots && (
        <Card className="mb-4">
          <Card.Body className="d-flex align-items-center gap-3">
            <CalendarDays aria-hidden="true" size={28} className="mh-card-icon flex-shrink-0" />
            <div>
              <h2 className="h5 mb-1">No slots this week</h2>
              <p className="mb-0">There are no slots scheduled for this week yet.</p>
            </div>
          </Card.Body>
        </Card>
      )}

      {canShowWeek && (
        <div className="mh-week-grid">
          {days.map((day) => (
            <section
              key={day.isoDate}
              className={`mh-day rounded-3 overflow-hidden${day.isPast ? ' mh-day-past' : ''}${day.isToday ? ' mh-day-today' : ''}`}
              aria-current={day.isToday ? 'date' : undefined}
              aria-labelledby={`day-${day.isoDate}`}
            >
              <header className="mh-day-header d-flex align-items-center gap-2 p-2 border-bottom">
                <h2 id={`day-${day.isoDate}`} className="h5 mb-0">
                  {formatDate(day.isoDate)}
                </h2>
                {day.isToday && <span className="mh-today-label">Today</span>}
              </header>
              <div className="p-3">
                {day.slots.length > 0 ? (
                  <div className="d-grid gap-2">
                    {day.slots.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        isPastDay={day.isPast}
                        expanded={selectedSlotId === slot.id}
                        onSelect={(selected) =>
                          setSelectedSlotId((current) => (current === selected.id ? null : selected.id))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-secondary mb-0">No slots</p>
                )}
                {!day.isPast && (
                  // Placeholder for future "Add slot" button; currently don't redirect
                  <Button variant="outline-primary" className="w-100 mt-3">
                    + Add slot
                  </Button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

    </>
  );
}
