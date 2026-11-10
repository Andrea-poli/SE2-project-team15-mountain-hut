// MH-09 FE1 – "Copy week" dialog of the staff slots view. The staff member picks the target week with ‹ / ›
// (like the page header); POST /api/slots/copy-week copies every slot of the shown week (weekStart, a Monday),
// with its tables, into it. Past weeks cannot be chosen and the shown week is skipped in both directions.
// The page mounts the dialog only while it is open, so it starts fresh each time; the picker reuses the
// mh-week-navigation / mh-week-range classes of SlotsWeekPage.css (loaded by that page).
// onCopied(result, targetWeekIso) receives { created, skipped } and the Monday ('YYYY-MM-DD') of the target week.
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { copyWeek } from '../api/slots.js';
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

  // No past weeks: ‹ is disabled on the current week, or when the only earlier choice would be a past week.
  const previousTarget = stepWeek(target, -7, sourceIso);
  const canGoBack = toLocalIsoDate(previousTarget) >= currentWeekIso;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const targetIso = toLocalIsoDate(target);
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
          <div className="mh-week-navigation mb-3" role="group" aria-labelledby={pickerLabelId}>
            <Button
              variant="outline-primary"
              className="d-flex flex-shrink-0 align-items-center justify-content-center p-2"
              aria-label="Previous week"
              disabled={!canGoBack || saving}
              onClick={() => setTarget(previousTarget)}
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
              onClick={() => setTarget(stepWeek(target, 7, sourceIso))}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </Button>
          </div>
          <p className="small text-body-secondary mb-0">
            Bookings are not copied. Slots in the past or overlapping existing ones are skipped.
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
