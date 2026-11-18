// Shared page frame for the MH-07 password pages (Change/Forgot/Reset): one Row/Col/Card, a <title> and
// an h1. Login/Register keep their own markup (already reviewed, out of scope here) to avoid touching them.
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

export default function AuthCard({ title, heading, children }) {
  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>{title}</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-2">{heading}</h1>
            {children}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
