import Alert from 'react-bootstrap/Alert';

// Error shown to the user; renders nothing when there is no message.
export default function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <Alert variant="danger" role="alert">
      {message}
    </Alert>
  );
}
