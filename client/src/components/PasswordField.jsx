// Password field with a "show password" toggle inside the input, on the right (GOV.UK "Passwords"
// pattern). Same rules as FormField: visible label linked to the input (controlId), required,
// aria-invalid, aria-describedby to error and help, input id usable with getElementById for the focus.
// Other props (value, onChange, onBlur, autoComplete, required…) go to the input.
// toggleLabel: fixed accessible name of the button ("Show password"); aria-pressed tells whether
// the password is shown. The password is hidden again when the form is submitted.
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Form from 'react-bootstrap/Form';

export default function PasswordField({ id, label, toggleLabel, help, error, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  // Hide the password on submit: the browser must not see (or offer to save) a plain text field.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    const hide = () => setVisible(false);
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);

  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
  const Icon = visible ? EyeOff : Eye;

  return (
    <Form.Group controlId={id} className="mb-3 mh-password">
      <Form.Label>{label}</Form.Label>
      {/* Input and button only: the button is centred on the input's height (theme.css, section 12). */}
      <div className="mh-password-box">
        <Form.Control
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          // While shown as text: no capital letter, autocorrect or spell check on phones.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          isInvalid={Boolean(error)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        <button
          type="button"
          className="mh-password-toggle"
          aria-label={toggleLabel}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          // Keeps the focus in the input on a mouse click (no blur check, no lost click, typing goes on).
          onMouseDown={(e) => e.preventDefault()}
        >
          <Icon aria-hidden="true" size={20} />
        </button>
      </div>
      {/* d-block: outside the box the message is not a sibling of the input, so Bootstrap would hide it. */}
      {error && (
        <Form.Control.Feedback type="invalid" id={errorId} className="d-block">
          {error}
        </Form.Control.Feedback>
      )}
      {help && (
        <Form.Text id={helpId} className="d-block">
          {help}
        </Form.Text>
      )}
    </Form.Group>
  );
}
