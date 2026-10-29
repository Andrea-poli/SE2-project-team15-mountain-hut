// Home page (U7, step 9b): static information about the hut, texts in content/hut.js.
import { Binoculars, CalendarSearch, Info, MapPin, Route } from 'lucide-react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Link } from 'react-router';
import { hut } from '../../content/hut.js';
import { routes } from '../../routes.js';

// One section of the home page as a card: decorative icon, h2 and content.
function InfoCard({ id, icon: Icon, title, children }) {
  return (
    <Col>
      <Card as="section" aria-labelledby={id} className="h-100">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-3">
            <Icon aria-hidden="true" size={28} className="mh-card-icon" />
            <h2 id={id} className="h4 mb-0">
              {title}
            </h2>
          </div>
          {children}
        </Card.Body>
      </Card>
    </Col>
  );
}

export default function HomePage() {
  return (
    <>
      <title>Mountain Hut</title>
      <section className="mh-hero p-4 p-md-5 mb-4">
        <h1>{hut.name}</h1>
        <p className="fs-5 mb-4">{hut.tagline}</p>
        <Button as={Link} to={routes.checkAvailability} size="lg" className="d-inline-flex align-items-center">
          <CalendarSearch aria-hidden="true" size={24} className="me-2" />
          Check availability
        </Button>
      </section>

      {/* One column on phones, two from 768px. */}
      <Row xs={1} md={2} className="g-4">
        <InfoCard id="about" icon={Info} title="About the hut">
          <p className="mb-0">{hut.description}</p>
        </InfoCard>
        <InfoCard id="location" icon={MapPin} title="Location">
          <p className="mb-0">{hut.location}</p>
        </InfoCard>
        <InfoCard id="getting-there" icon={Route} title="How to get there">
          <p className="mb-0">{hut.gettingThere}</p>
        </InfoCard>
        <InfoCard id="points-of-interest" icon={Binoculars} title="Points of interest">
          {hut.pointsOfInterest.length === 0 ? (
            <p className="mb-0">Points of interest – coming soon.</p>
          ) : (
            <ul className="mb-0">
              {hut.pointsOfInterest.map((poi) => (
                <li key={poi.name}>
                  <strong>{poi.name}</strong> – {poi.description} ({poi.walkingTimeMin} min walk)
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      </Row>
    </>
  );
}
