import Spinner from 'react-bootstrap/Spinner';

// Visible text, announced by screen readers through role="status"; the spinner is decoration.
export default function Loading() {
  return (
    <div role="status" className="d-flex align-items-center gap-2 my-3">
      <Spinner animation="border" size="sm" aria-hidden="true" />
      <span>Loading…</span>
    </div>
  );
}
