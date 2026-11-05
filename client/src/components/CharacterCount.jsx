// Character count under a text field (GOV.UK "Character count" pattern), shown by FormField when it
// gets characterLimit. The text is never cut (no maxLength): past the limit the count turns red and
// the form's check on submit shows the error next to the field.
// Two copies of the message: the visible one is linked to the field (aria-describedby on FormField),
// so it is read when the field gets the focus; a hidden live copy is updated only after a pause in
// typing, so screen readers do not announce every key.
import { useEffect, useRef, useState } from 'react';

const ANNOUNCE_DELAY_MS = 500;

function message(remaining) {
  const n = Math.abs(remaining);
  const characters = n === 1 ? 'character' : 'characters';
  return remaining >= 0 ? `You have ${n} ${characters} remaining` : `You have ${n} ${characters} too many`;
}

/** Counted like the form checks: without the spaces at the ends. */
export default function CharacterCount({ id, value, limit }) {
  const remaining = limit - (typeof value === 'string' ? value.trim().length : 0);
  const text = message(remaining);

  // Live copy: empty at first (nothing to announce when the page opens), then the text of the
  // latest pause in typing. Compared with the last text seen, not "first render": StrictMode runs
  // the effect twice on mount.
  const [announced, setAnnounced] = useState('');
  const lastText = useRef(text);
  useEffect(() => {
    if (text === lastText.current) return undefined;
    lastText.current = text;
    const timer = setTimeout(() => setAnnounced(text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <>
      <div id={id} className={`form-text mh-char-count${remaining < 0 ? ' mh-char-count-over' : ''}`}>
        {text}
      </div>
      <div className="visually-hidden" aria-live="polite">
        {announced}
      </div>
    </>
  );
}
