import Alert from 'react-bootstrap/Alert';

// Error shown to the user; renders nothing when there is no message.
// tabIndex -1 + ref: a form can move the focus here after a failed submit (not in the Tab order).
export default function ErrorMessage({ message, ref }) {
  if (!message) return null;
  return (
    <Alert variant="danger" role="alert" tabIndex={-1} ref={ref}>
      {message}
    </Alert>
  );
}
