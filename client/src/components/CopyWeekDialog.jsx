// MH-09 FE1 – "Copy week" dialog of the staff slots view. The staff member picks the target week with ‹ / ›
// (like the page header); POST /api/slots/copy-week copies every slot of the shown week (weekStart, a Monday),
// with its tables, into it. Past weeks cannot be chosen and the shown week is skipped in both directions.
// The copy replaces the slots of the target week that have not started (PO, issue #45): when the chosen week has
// some, a warning says so. If one of them is booked the server answers 409, shown here; the dialog stays open.
// The page mounts the dialog only while it is open, so it starts fresh each time; the picker reuses the
// mh-week-navigation / mh-week-range classes of SlotsWeekPage.css (loaded by that page).
// onCopied(result, targetWeekIso) receives { created, replaced, skipped } and the Monday ('YYYY-MM-DD') of the target week.
import { ChevronLeft, ChevronRight, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { copyWeek, listSlots } from '../api/slots.js';
import ErrorMessage from './ErrorMessage.jsx';
import { addDays, formatWeekRange, startOfWeek, toLocalIsoDate } from '../utils/format.js';

/** The week one step before or after `target` (amount -7 or 7), skipping the source week. */
function stepWeek(target, amount, sourceIso) {
  const next = addDays(target, amount);
  return toLocalIsoDate(next) === sourceIso ? addDays(next, amount) : next;
}

export default function CopyWeekDialog({ weekStart, onHide, onCopied }) {
  const id = useId();
  const titleId = `${id}-title`;
  const pickerLabelId = `${id}-week`;
  const sourceIso = toLocalIsoDate(weekStart);
  const currentWeekIso = toLocalIsoDate(startOfWeek(new Date()));
  // The week after the shown one; if that week has already ended, the week after the current one.
  const [target, setTarget] = useState(() => {
    const nextWeek = addDays(weekStart, 7);
    return toLocalIsoDate(nextWeek) < currentWeekIso ? addDays(startOfWeek(new Date()), 7) : nextWeek;
  });
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const errorRef = useRef(null);
  // Slots of the target week that the copy would replace, with the week they belong to.
  const [targetSlots, setTargetSlots] = useState({ week: null, count: 0 });
  const targetIso = toLocalIsoDate(target);

  // Read the target week whenever it changes; answers for a week the user already left are ignored.
  // If the read fails, no warning is shown: the copy itself still reports any error.
  useEffect(() => {
    let cancelled = false;
    listSlots(targetIso, toLocalIsoDate(addDays(target, 6)))
      .then((slots) => {
        // Slots already under way are never replaced, so they are not counted.
        if (!cancelled) setTargetSlots({ week: targetIso, count: slots.filter((slot) => !slot.past).length });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [target, targetIso]);

  const replacedCount = targetSlots.week === targetIso ? targetSlots.count : 0;

  // No past weeks: ‹ is disabled on the current week, or when the only earlier choice would be a past week.
  const previousTarget = stepWeek(target, -7, sourceIso);
  const canGoBack = toLocalIsoDate(previousTarget) >= currentWeekIso;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const result = await copyWeek(sourceIso, targetIso);
      onCopied(result, targetIso);
    } catch (error) {
      setSaving(false);
      setSubmitError(error.message);
      // After the render that shows the error, move the focus to it so screen readers read it.
      setTimeout(() => errorRef.current?.focus());
    }
  }

  return (
    // While the copy is running, Escape and the backdrop do not close the dialog.
    <Modal show centered onHide={() => !saving && onHide()} aria-labelledby={titleId}>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title as="h2" id={titleId} className="h4">
            Copy week
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ErrorMessage message={submitError} ref={errorRef} />
          <p id={pickerLabelId} className="form-label mb-2">
            Copy the slots of {formatWeekRange(weekStart, addDays(weekStart, 6))}, with their tables, into:
          </p>
          <div className="mh-week-navigation mb-2" role="group" aria-labelledby={pickerLabelId}>
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Previous week"
              disabled={!canGoBack || saving}
              onClick={() => {
                setTarget(previousTarget);
                setSubmitError(null);
              }}
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </Button>
            <p className="mh-week-range mb-0 text-center fw-semibold" aria-live="polite">
              {formatWeekRange(target, addDays(target, 6))}
            </p>
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Next week"
              disabled={saving}
              onClick={() => {
                setTarget(stepWeek(target, 7, sourceIso));
                setSubmitError(null);
              }}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </Button>
          </div>
          <div className="mb-3" aria-live="polite">
            {replacedCount > 0 && (
              <p className="d-flex align-items-start gap-2 mb-0 text-warning-emphasis">
                <TriangleAlert aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
                {replacedCount === 1
                  ? 'This week has 1 slot: it will be replaced.'
                  : `This week has ${replacedCount} slots: they will be replaced.`}
              </p>
            )}
          </div>
          <p className="small text-body-secondary mb-0">
            Bookings are not copied. Slots in the past or overlapping a slot already under way are skipped.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={saving} onClick={onHide}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="d-inline-flex align-items-center gap-1"
            disabled={saving}
          >
            <Copy aria-hidden="true" size={18} />
            {saving ? 'Copying…' : 'Copy slots'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
