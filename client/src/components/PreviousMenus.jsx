// MH-10 FE2 – "Reuse a previous menu" in the menu editor (MenuEditorDialog). GET /api/slots/menus lists the menus
// already written (each text once, with its most recent slot, most recent first, at most 20); the search box
// filters them by text, asked again after a short pause in typing. "Use this menu" hands the text to the editor,
// where it can be changed before saving (PO issue #39: "reuse (and change) previous menus").
// The menu of the slot being edited is left out: it is already in the editor.
// onUse(menu, previous) receives the text and the PreviousMenu ({ menu, slotId, date, startTime, label }).
import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import { listPreviousMenus } from '../api/slots.js';
import ErrorMessage from './ErrorMessage.jsx';
import FieldLabel from './FieldLabel.jsx';
import Loading from './Loading.jsx';
import MenuText from './MenuText.jsx';
import { formatDate } from '../utils/format.js';

const SEARCH_DELAY_MS = 300;
const SEARCH_MAX_LENGTH = 100; // same limit as the server (q)

export default function PreviousMenus({ slotId, onUse, disabled }) {
  const id = useId();
  const searchId = `${id}-search`;
  const [query, setQuery] = useState('');
  // Result of the last search, with the text it was made for: while it differs from the box, the list is loading.
  const [result, setResult] = useState({ query: null, menus: [], error: null });
  // The first list is asked at once, the next ones after a pause in typing.
  const delay = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      listPreviousMenus(query)
        .then((menus) => {
          if (!cancelled) setResult({ query, menus, error: null });
        })
        .catch((error) => {
          if (!cancelled) setResult({ query, menus: [], error: error.message });
        });
    }, delay.current);
    delay.current = SEARCH_DELAY_MS;
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const loading = result.query !== query;
  const menus = result.menus.filter((previous) => previous.slotId !== slotId);
  const searched = query.trim() !== '';

  return (
    <section aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="h6">
        Reuse a previous menu
      </h3>
      <Form.Group controlId={searchId} className="mb-2">
        <FieldLabel icon={Search}>Search previous menus</FieldLabel>
        <Form.Control
          type="search"
          value={query}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="e.g. polenta"
          onChange={(event) => setQuery(event.target.value)}
          // Enter in the search box must not save the menu.
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
        />
      </Form.Group>
      {loading ? (
        <Loading />
      ) : (
        <>
          <ErrorMessage message={result.error} />
          {!result.error && menus.length === 0 && (
            <p className="text-body-secondary mb-0" role="status">
              {searched ? 'No previous menus contain this text.' : 'No menus have been written yet.'}
            </p>
          )}
          {menus.length > 0 && (
            <ListGroup className="mh-previous-menus">
              {menus.map((previous) => {
                const slotName = `${previous.label}, ${formatDate(previous.date)} ${previous.startTime}`;
                return (
                  <ListGroup.Item key={`${previous.slotId}-${previous.menu}`} className="d-grid gap-2">
                    <div className="small fw-semibold">{slotName}</div>
                    <MenuText menu={previous.menu} className="small" />
                    <div>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        disabled={disabled}
                        aria-label={`Use the menu of ${slotName}`}
                        onClick={() => onUse(previous.menu, previous)}
                      >
                        Use this menu
                      </Button>
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}
        </>
      )}
    </section>
  );
}
