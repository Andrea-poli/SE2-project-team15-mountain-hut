import { forwardRef, useId, useImperativeHandle, useState } from 'react';
import { Plus, Trash2, TriangleAlert, Utensils } from 'lucide-react';
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
      <legend className="d-flex align-items-center gap-2 h5">
        <Utensils aria-hidden="true" size={18} />
        Dietary needs and allergies
        <span className="ms-auto small fw-normal text-body-secondary">(optional)</span>
      </legend>
      <p className="small mb-3 align-items-center d-flex gap-1">
        Tick <TriangleAlert aria-hidden="true" size={16} /> Allergies when the kitchen must take special care.
      </p>
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
                className={`p-2 rounded-3 border ${requirement.hasAllergies ? 'mh-requirement-allergy' : 'bg-body'}`}
              >
                <div className="row g-2 align-items-center">
                  <div className="col-auto order-1">
                    <Form.Check
                      id={`${id}-allergy-${rowId}`}
                      label={
                        <span className="d-flex align-items-center gap-1">
                          <TriangleAlert aria-hidden="true" size={16} />
                          Allergies
                        </span>
                      }
                      checked={requirement.hasAllergies === true}
                      onChange={(event) => updateRequirement(index, 'hasAllergies', event.target.checked)}
                      className="d-flex align-items-center gap-2 mb-0"
                    />
                  </div>
                  <Form.Group controlId={descriptionId} className="col-12 col-sm order-3 order-sm-2 mb-0">
                    <Form.Label className="visually-hidden">Description for requirement {index + 1}</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder={requirement.hasAllergies ? 'e.g. 1 peanut allergy' : 'e.g. 2 vegetarians'}
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
                        Enter a description for requirement {index + 1}.
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                  <div className="col-auto order-2 order-sm-3 ms-auto ms-sm-0">
                    <Button
                      type="button"
                      variant="outline-danger"
                      aria-label={`Remove requirement ${index + 1}`}
                      onClick={() => removeRequirement(index)}
                      className="d-flex align-items-center justify-content-center"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Button type="button" variant="outline-primary" onClick={addRequirement}>
        <Plus aria-hidden="true" size={18} /> Add
      </Button>
    </fieldset>
  );
});

export default PartyRequirementsForm;

export function PartyRequirementsTextDisplay({ requirements = [] }) {
  const id = useId();
  const items = Array.isArray(requirements) ? requirements : [];
  if (items.length === 0) return null;

  const occurrences = new Map();
  const keyedItems = items.map((requirement) => {
    const contentKey = JSON.stringify([requirement.hasAllergies, requirement.description]);
    const occurrence = occurrences.get(contentKey) ?? 0;
    occurrences.set(contentKey, occurrence + 1);
    return { requirement, key: `${contentKey}-${occurrence}` };
  });

  return (
    <section className="mt-4" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="d-flex align-items-center gap-2 h5">
        <Utensils aria-hidden="true" size={18} />
        Dietary needs and allergies
      </h2>
      <ul className="list-unstyled d-grid gap-2 mb-0">
        {keyedItems.map(({ requirement, key }) => (
          <li key={key} className="d-flex align-items-start gap-2">
            <span
              className={`badge rounded-pill d-inline-flex align-items-center justify-content-center gap-1 ${
                requirement.hasAllergies ? 'mh-requirement-allergy-badge' : 'bg-secondary-subtle text-body'
              }`}
            >
              {requirement.hasAllergies && <TriangleAlert aria-hidden="true" size={14} />}
              {requirement.hasAllergies ? 'Allergies' : 'Diet'}
            </span>
            <span>{requirement.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
