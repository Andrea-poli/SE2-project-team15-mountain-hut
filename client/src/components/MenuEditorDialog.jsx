// MH-10 FE1 – menu editor of a slot, opened from the staff week view (SlotsWeekPage): "Add menu" on the open slot
// card, or "Edit menu" in the dialog that shows the menu (MenuViewDialog).
// The menu is free text with a little formatting (utils/menuFormat.js): the toolbar adds the marks around the
// selection (bold, italic) or at the start of the selected lines (list item, sub-item), the preview shows the
// result with the same safe renderer as the meals page (MenuText). "Save menu" sends PUT /api/slots/{id}/menu,
// "Remove menu" sends null. Any slot can get a menu, also one that has started or is closed (openapi).
// MH-10 FE2 – "Reuse a previous menu" (PreviousMenus) copies an earlier menu into the editor, to change it before saving.
// The page mounts the dialog only while it is open, so it starts from the saved menu each time. Only Cancel and
// the close button close it (no backdrop click), so a long text is not lost by a click outside.
// onSaved(slot, removed) receives the slot answered by the server and true when the menu was removed.
import { Bold, History, IndentIncrease, Italic, List, Save, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ButtonToolbar from 'react-bootstrap/ButtonToolbar';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { setSlotMenu } from '../api/slots.js';
import { useFormErrors } from '../hooks/useFormErrors.js';
import ErrorMessage from './ErrorMessage.jsx';
import FormField from './FormField.jsx';
import MenuText from './MenuText.jsx';
import PreviousMenus from './PreviousMenus.jsx';
import './MenuEditorDialog.css';
import { formatDate, formatTimeRange } from '../utils/format.js';
import { MENU_MAX_LENGTH, prefixLines, wrapSelection } from '../utils/menuFormat.js';

const MENU_ID = 'slot-menu-text';
const FIELD_IDS = { menu: MENU_ID };

function validate({ menu, hadMenu }) {
  const text = menu.trim();
  if (text === '') {
    return { menu: hadMenu ? 'Enter the menu, or press "Remove menu".' : 'Enter the menu.' };
  }
  if (text.length > MENU_MAX_LENGTH) return { menu: `The menu must be ${MENU_MAX_LENGTH} characters or fewer.` };
  return {};
}

// Toolbar buttons: what they do to the text and selection of the textarea.
const TOOLS = [
  { name: 'Bold', icon: Bold, apply: (value, start, end) => wrapSelection(value, start, end, '**') },
  { name: 'Italic', icon: Italic, apply: (value, start, end) => wrapSelection(value, start, end, '*') },
  { name: 'List item', icon: List, apply: (value, start, end) => prefixLines(value, start, end, 'item') },
  { name: 'Sub-item', icon: IndentIncrease, apply: (value, start, end) => prefixLines(value, start, end, 'subItem') },
];

export default function MenuEditorDialog({ slot, onHide, onSaved }) {
  const id = useId();
  const titleId = `${id}-title`;
  const previewId = `${id}-preview`;
  const hadMenu = Boolean(slot.menu);
  const [menu, setMenu] = useState(slot.menu || '');
  const [saving, setSaving] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  // "Menu of … copied" after a reuse, announced to screen readers; cleared by the next change.
  const [reused, setReused] = useState(null);
  const { errors, generalError, generalRef, checkOnSubmit, recheck, showGeneralError } = useFormErrors(
    validate,
    FIELD_IDS,
  );
  const textareaRef = useRef(null);

  // The selection to restore after a toolbar change, once React has put the new text in the textarea.
  const pendingSelection = useRef(null);
  useEffect(() => {
    const selection = pendingSelection.current;
    if (!selection) return;
    pendingSelection.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(selection.start, selection.end);
  });

  function applyTool(tool) {
    const { selectionStart, selectionEnd } = textareaRef.current;
    const next = tool.apply(menu, selectionStart, selectionEnd);
    setMenu(next.value);
    setReused(null);
    pendingSelection.current = { start: next.start, end: next.end };
  }

  function reuseMenu(text, previous) {
    setMenu(text);
    setReuseOpen(false);
    setReused(`Menu of ${previous.label}, ${formatDate(previous.date)} copied: change it if needed, then save.`);
    pendingSelection.current = { start: text.length, end: text.length };
  }

  async function save(newMenu) {
    setSaving(true);
    try {
      const updated = await setSlotMenu(slot.id, newMenu);
      onSaved(updated, newMenu === null);
    } catch (error) {
      setSaving(false);
      showGeneralError(error.message);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (saving || !checkOnSubmit({ menu, hadMenu })) return;
    save(menu.trim());
  }

  return (
    <Modal show centered size="lg" backdrop="static" onHide={() => !saving && onHide()} aria-labelledby={titleId}>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title as="h2" id={titleId} className="h4">
            {hadMenu ? 'Edit menu' : 'Add menu'}
            <span className="d-block fs-6 fw-normal text-body-secondary mt-1">
              {slot.label}, {formatDate(slot.date)}, {formatTimeRange(slot.startTime, slot.endTime)}
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ErrorMessage message={generalError} ref={generalRef} />

          <Button
            variant="outline-primary"
            size="sm"
            className="d-inline-flex align-items-center gap-1 mb-3"
            aria-expanded={reuseOpen}
            aria-controls={`${id}-reuse`}
            disabled={saving}
            onClick={() => setReuseOpen((open) => !open)}
          >
            <History aria-hidden="true" size={16} />
            {reuseOpen ? 'Hide previous menus' : 'Reuse a previous menu'}
          </Button>
          {reuseOpen && (
            <div id={`${id}-reuse`} className="mh-menu-reuse mb-3">
              <PreviousMenus slotId={slot.id} onUse={reuseMenu} disabled={saving} />
            </div>
          )}

          <ButtonToolbar className="mb-2" role="toolbar" aria-label="Menu formatting" aria-controls={MENU_ID}>
            <ButtonGroup size="sm">
              {TOOLS.map((tool) => (
                <Button
                  key={tool.name}
                  variant="outline-secondary"
                  title={tool.name}
                  aria-label={tool.name}
                  disabled={saving}
                  onClick={() => applyTool(tool)}
                >
                  <tool.icon aria-hidden="true" size={16} />
                </Button>
              ))}
            </ButtonGroup>
          </ButtonToolbar>
          <FormField
            id={MENU_ID}
            label="Menu"
            as="textarea"
            rows={8}
            ref={textareaRef}
            value={menu}
            error={errors.menu}
            help='Select some text and use the buttons, or type: **bold**, *italic*, "- " at the start of a line for an item, two spaces and "- " for a sub-item. An empty line starts a new paragraph.'
            characterLimit={MENU_MAX_LENGTH}
            disabled={saving}
            onChange={(event) => {
              setMenu(event.target.value);
              setReused(null);
            }}
            onBlur={() => recheck('menu', { menu, hadMenu })}
          />
          <p className="small text-success mb-3" aria-live="polite">
            {reused}
          </p>

          <section aria-labelledby={previewId}>
            <h3 id={previewId} className="h6">
              Preview
            </h3>
            <div className="mh-menu-preview rounded-2 p-3">
              {menu.trim() ? (
                <MenuText menu={menu} />
              ) : (
                <p className="text-body-secondary mb-0">The menu appears here as hikers will see it.</p>
              )}
            </div>
          </section>
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <div>
            {hadMenu && (
              <Button
                type="button"
                variant="outline-danger"
                className="d-inline-flex align-items-center gap-1"
                disabled={saving}
                onClick={() => save(null)}
              >
                <Trash2 aria-hidden="true" size={18} />
                Remove menu
              </Button>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button type="button" variant="outline-secondary" disabled={saving} onClick={onHide}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="d-inline-flex align-items-center gap-1" disabled={saving}>
              <Save aria-hidden="true" size={18} />
              {saving ? 'Saving…' : 'Save menu'}
            </Button>
          </div>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
