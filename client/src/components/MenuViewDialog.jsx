// MH-10 FE1 – the menu of a slot in a dialog in the middle of the page, opened by "View menu" on the open slot card
// of the staff week view. The menu is shown with the safe renderer (MenuText); "Edit menu" opens the editor.
// PO (MH-10, issue #59): once the slot has started its menu stays fixed: canEdit is false and "Edit menu" is shown but
// unavailable, with the reason in a tooltip (UnavailableButton). The page mounts the dialog only while it is open.
import { SquarePen } from 'lucide-react';
import { useId } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import MenuText from './MenuText.jsx';
import UnavailableButton from './UnavailableButton.jsx';
import { formatDate, formatTimeRange } from '../utils/format.js';

export default function MenuViewDialog({ slot, canEdit, onHide, onEdit }) {
  const titleId = `${useId()}-title`;

  return (
    <Modal show centered scrollable onHide={onHide} aria-labelledby={titleId}>
      <Modal.Header closeButton>
        <Modal.Title as="h2" id={titleId} className="h4">
          Menu
          <span className="d-block fs-6 fw-normal text-body-secondary mt-1">
            {slot.label}, {formatDate(slot.date)}, {formatTimeRange(slot.startTime, slot.endTime)}
          </span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <MenuText menu={slot.menu} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          Close
        </Button>
        {canEdit ? (
          <Button variant="primary" className="d-inline-flex align-items-center gap-1" onClick={() => onEdit(slot)}>
            <SquarePen aria-hidden="true" size={18} />
            Edit menu
          </Button>
        ) : (
          <UnavailableButton
            variant="primary"
            className="d-inline-flex align-items-center gap-1"
            reason="This slot has started: its menu can no longer be changed or removed."
          >
            <SquarePen aria-hidden="true" size={18} />
            Edit menu
          </UnavailableButton>
        )}
      </Modal.Footer>
    </Modal>
  );
}
