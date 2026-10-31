// One accessible form field: visible label linked to the control (controlId), optional help text,
// error next to the field. The control points to both with aria-describedby and gets aria-invalid.
// The control's id is `id` (controlId): a page moves the focus to a field with getElementById(id).
// Other props go to the control: `required` becomes the HTML attribute, so screen readers say
// "required" (the form has noValidate, so the browser shows no bubbles).
// characterLimit (optional): a character count under the help text (CharacterCount), also linked to the control.
import Form from 'react-bootstrap/Form';
import CharacterCount from './CharacterCount.jsx';

export default function FormField({ id, label, help, error, characterLimit, ...controlProps }) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = characterLimit ? `${id}-count` : undefined;
  const describedBy = [errorId, helpId, countId].filter(Boolean).join(' ') || undefined;

  return (
    <Form.Group controlId={id} className="mb-3">
      <Form.Label>{label}</Form.Label>
      <Form.Control
        isInvalid={Boolean(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...controlProps}
      />
      {/* Error before help: right under the field, where the eye goes after the red border. */}
      {error && (
        <Form.Control.Feedback type="invalid" id={errorId}>
          {error}
        </Form.Control.Feedback>
      )}
      {help && (
        <Form.Text id={helpId} className="d-block">
          {help}
        </Form.Text>
      )}
      {characterLimit && <CharacterCount id={countId} value={controlProps.value} limit={characterLimit} />}
    </Form.Group>
  );
}
