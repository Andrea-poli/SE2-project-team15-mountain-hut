import { forwardRef, useId, useImperativeHandle, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

const EMPTY_REQUIREMENTS = [];

const PartyRequirementsForm = forwardRef(function PartyRequirementsForm({ value, onChange, showErrors = false }, ref) {
  const id = useId();
  const requirements = Array.isArray(value) ? value : EMPTY_REQUIREMENTS;
  // Track row IDs separately from requirements array to avoid issues with React keying when items are added/removed
  const [rowIds, setRowIds] = useState(() => requirements.map((_, index) => index));
  const [nextRowId, setNextRowId] = useState(requirements.length);
  const [previousCount, setPreviousCount] = useState(requirements.length);
  const [touchedRowIds, setTouchedRowIds] = useState(() => new Set());

  // Keep rowIds in sync with requirements length
  if (previousCount !== requirements.length) {
    setPreviousCount(requirements.length);
    if (rowIds.length > requirements.length) {
      setRowIds(rowIds.slice(0, requirements.length));
    } else if (rowIds.length < requirements.length) {
      const added = Array.from({ length: requirements.length - rowIds.length }, (_, index) => nextRowId + index);
      setRowIds([...rowIds, ...added]);
      setNextRowId(nextRowId + added.length);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      focusFirstEmptyDescription() {
        const index = requirements.findIndex(
          (requirement) => typeof requirement.description !== 'string' || !requirement.description.trim(),
        );
        if (index !== -1) document.getElementById(`${id}-description-${rowIds[index]}`)?.focus();
      },
    }),
    [id, requirements, rowIds],
  );

  function updateRequirement(index, field, fieldValue) {
    onChange(
      requirements.map((requirement, itemIndex) => ({
        hasAllergies: itemIndex === index && field === 'hasAllergies' ? fieldValue : requirement.hasAllergies,
        description: itemIndex === index && field === 'description' ? fieldValue : requirement.description,
      })),
    );
  }

  function addRequirement() {
    setRowIds((current) => [...current, nextRowId]);
    setNextRowId((current) => current + 1);
    onChange([...requirements, { hasAllergies: false, description: '' }]);
  }

  function removeRequirement(index) {
    const rowId = rowIds[index];
    setRowIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setTouchedRowIds((current) => {
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
    onChange(requirements.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <fieldset className="mb-3">
      <legend className="h5">Party requirements</legend>
      <p className="mb-3">Add dietary requirements or allergies for people in your party. This is optional.</p>
      {requirements.length > 0 && (
        <div className="d-grid gap-3 mb-3">
          {requirements.map((requirement, index) => {
            const description = typeof requirement.description === 'string' ? requirement.description : '';
            const rowId = rowIds[index];
            const descriptionId = `${id}-description-${rowId}`;
            const errorId = `${descriptionId}-error`;
            const hasDescription = description.trim().length > 0;
            const showRowError = !hasDescription && (showErrors || touchedRowIds.has(rowId));

            return (
              <div
                key={rowId}
                className={`p-3 rounded-3 border ${requirement.hasAllergies ? 'mh-requirement-allergy' : 'bg-body'}`}
              >
                <div className="d-flex align-items-center justify-content-between gap-3">
                  <Form.Check
                    id={`${id}-allergy-${rowId}`}
                    label={`Requirement ${index + 1} involves an allergy`}
                    checked={requirement.hasAllergies === true}
                    onChange={(event) => updateRequirement(index, 'hasAllergies', event.target.checked)}
                    className="d-flex align-items-center gap-2 mb-0"
                  />
                  <Button
                    type="button"
                    variant="outline-danger"
                    aria-label={`Remove requirement ${index + 1}`}
                    onClick={() => removeRequirement(index)}
                  >
                    Remove
                  </Button>
                </div>
                <Form.Group controlId={descriptionId} className="mt-3 mb-0">
                  <Form.Label>Description for requirement {index + 1}</Form.Label>
                  <Form.Control
                    type="text"
                    value={description}
                    onChange={(event) => updateRequirement(index, 'description', event.target.value)}
                    onBlur={() => {
                      setTouchedRowIds((current) => new Set(current).add(rowId));
                    }}
                    isInvalid={showRowError}
                    aria-invalid={showRowError ? true : undefined}
                    aria-describedby={showRowError ? errorId : undefined}
                    required
                  />
                  {showRowError && (
                    <Form.Control.Feedback type="invalid" id={errorId}>
                      Enter a description for this requirement.
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </div>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="outline-primary"
        onClick={addRequirement}
      >
        Add requirement
      </Button>
    </fieldset>
  );
});

export default PartyRequirementsForm;

export function PartyRequirementsTextDisplay({ requirements = [] }) {
  const id = useId();
  const items = Array.isArray(requirements) ? requirements : [];
  const occurrences = new Map();
  const keyedItems = items.map((requirement) => {
    const contentKey = JSON.stringify([requirement.hasAllergies, requirement.description]);
    const occurrence = occurrences.get(contentKey) ?? 0;
    occurrences.set(contentKey, occurrence + 1);
    return { requirement, key: `${contentKey}-${occurrence}` };
  });

  return (
    <section className="mt-4" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="h5">
        Party requirements
      </h2>
      {items.length === 0 ? (
        <p className="mb-0">No party requirements were provided.</p>
      ) : (
        <ul className="list-unstyled d-grid gap-2 mb-0">
          {keyedItems.map(({ requirement, key }) => (
            <li
              key={key}
              className={`p-3 rounded-3 border ${requirement.hasAllergies ? 'mh-requirement-allergy' : 'bg-body'}`}
            >
              {requirement.hasAllergies && <strong className="d-block mb-1">Allergy-related requirement</strong>}
              {requirement.description}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
