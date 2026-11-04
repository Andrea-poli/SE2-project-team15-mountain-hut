// MH-02 FE1 – Slots view (staff only). Reads GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD and displays a weekly
// schedule with a compact summary of each slot. Each slot can be expanded to view its details.
// The week can be navigated with previous/next buttons, past and current day are distinguished.
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import { Link, useSearchParams } from 'react-router';
import { listSlots } from '../../api/slots.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Loading from '../../components/Loading.jsx';
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

function parseWeekStart(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return startOfWeek(date);
}

export default function SlotsWeekPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentWeek = startOfWeek(new Date());
  const requestedWeek = searchParams.get('week');
  // If the requested week is invalid or missing, default to the current week.
  const weekStart = parseWeekStart(requestedWeek) ?? currentWeek;
  const weekEnd = addDays(weekStart, 6);
  const from = toLocalIsoDate(weekStart);
  const to = toLocalIsoDate(weekEnd);
  const rangeKey = `${from}:${to}`;
  const todayDate = toLocalIsoDate(new Date());
  const [slotResult, setSlotResult] = useState({ rangeKey: null, slots: [], error: null });
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  // If the requested week is not the same as the current week, update the URL to reflect the current week.
  useEffect(() => {
    if (requestedWeek !== from) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('week', from);
      setSearchParams(nextParams, { replace: true });
    }
  }, [from, requestedWeek, searchParams, setSearchParams]);

  // Fetch slots for the current week whenever the range changes.
  useEffect(() => {
    let cancelled = false;
    listSlots(from, to)
      .then((slots) => {
        if (!cancelled) {
          setSlotResult({ rangeKey, slots, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSlotResult({ rangeKey, slots: [], error: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [from, rangeKey, to]);

  const loading = slotResult.rangeKey !== rangeKey;
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
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('week', toLocalIsoDate(addDays(weekStart, amount)));
    setSearchParams(nextParams);
  }

  function moveToToday() {
    setSelectedSlotId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('week', toLocalIsoDate(currentWeek));
    setSearchParams(nextParams);
  }

  return (
    <>
      <title>Slots of the week – Mountain Hut</title>
      <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
        <h1 className="mb-0">Slots of the week</h1>
        <div className="d-flex flex-wrap align-items-center justify-content-center gap-3">
          <Button
            variant="outline-primary"
            className="mh-week-today flex-shrink-0"
            onClick={moveToToday}
            disabled={from === toLocalIsoDate(currentWeek)}
          >
            Today
          </Button>
          <nav className="mh-week-navigation" aria-label="Week navigation">
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Previous week"
              onClick={() => moveWeek(-7)}
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </Button>
            <p className="mh-week-range mb-0 text-center fw-semibold" aria-live="polite">
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
          <Link to={routes.newSlot} className="btn btn-primary d-inline-flex align-items-center gap-1">  
            <Plus aria-hidden="true" size={18} />
            New slot  
          </Link>
        </div>
      </div>

      <ErrorMessage message={error} />
      {loading && <Loading />}
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
                  <Link  
                    to={`${routes.newSlot}?date=${day.isoDate}`}
                    className="btn btn-outline-primary w-100 mt-3 d-flex
                    align-items-center justify-content-center gap-1"
                  >  
                    <Plus aria-hidden="true" size={18} />  
                    Add slot  
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

    </>
  );
}
