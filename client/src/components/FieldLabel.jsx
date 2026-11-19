// The label of a form field (react-bootstrap Form.Label, linked through the Form.Group's controlId), with an
// optional decorative icon before the text (I2, issue #39): aria-hidden, so the accessible name is the text only.
// Same size and spacing as the other icons next to text (e.g. the requirements legend): 18 px, gap-2.
import Form from 'react-bootstrap/Form';

export default function FieldLabel({ icon: Icon, children }) {
  if (!Icon) return <Form.Label>{children}</Form.Label>;
  return (
    <Form.Label className="d-flex align-items-center gap-2">
      <Icon aria-hidden="true" size={18} className="flex-shrink-0" />
      {children}
    </Form.Label>
  );
}
