import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { Plus, Trash2, TriangleAlert, Utensils } from 'lucide-react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

const EMPTY_REQUIREMENTS = [];

const PartyRequirementsForm = forwardRef(function PartyRequirementsForm(
  { value, onChange, submitAttempt = 0 },
  ref,
) {
  const id = useId();
  const requirements = Array.isArray(value) ? value : EMPTY_REQUIREMENTS;
  const nextId = useRef(0);

  const [touchedRowIds, setTouchedRowIds] = useState(() => new Set());
  const [previousSubmitAttempt, setPreviousSubmitAttempt] = useState(submitAttempt);
  const [submittedRowIds, setSubmittedRowIds] = useState(() => new Set());

  if (previousSubmitAttempt !== submitAttempt) {
    setPreviousSubmitAttempt(submitAttempt);
    setSubmittedRowIds((current) => new Set([...current, ...requirements.map((requirement) => requirement.id)]));
  }

  useImperativeHandle(
    ref,
    () => ({
      focusFirstEmptyDescription() {
        const index = requirements.findIndex(
          (requirement) => typeof requirement.description !== 'string' || !requirement.description.trim(),
        );
        if (index !== -1) document.getElementById(`${id}-description-${requirements[index].id}`)?.focus();
      },
    }),
    [id, requirements],
  );

  function updateRequirement(requirementId, field, fieldValue) {
    onChange(
      requirements.map((requirement) =>
        requirement.id === requirementId ? { ...requirement, [field]: fieldValue } : requirement,
      ),
    );
  }

  function addRequirement() {
    let requirementId;
    do {
      requirementId = `${id}-requirement-${nextId.current++}`;
    } while (requirements.some((requirement) => requirement.id === requirementId));
    onChange([...requirements, { id: requirementId, hasAllergies: false, description: '' }]);
  }

  function removeRequirement(requirementId) {
    setTouchedRowIds((current) => {
      const next = new Set(current);
      next.delete(requirementId);
      return next;
    });
    setSubmittedRowIds((current) => {
      const next = new Set(current);
      next.delete(requirementId);
      return next;
    });
    onChange(requirements.filter((requirement) => requirement.id !== requirementId));
  }

  return (
    <fieldset className="mb-3">
      <legend className="d-flex align-items-start gap-2 h5">
        <Utensils aria-hidden="true" size={18} className="flex-shrink-0 mt-1" />
        Dietary needs and allergies
        <span className="ms-auto small fw-normal text-body-secondary">(optional)</span>
      </legend>
      <p className="small mb-3 align-items-start d-flex gap-1">
        Tick <TriangleAlert aria-hidden="true" size={16} className="flex-shrink-0 mt-1"/>
        Allergies when the kitchen must take special care.
      </p>
      {requirements.length > 0 && (
        <div className="d-grid gap-3 mb-3">
          {requirements.map((requirement, index) => {
            const description = typeof requirement.description === 'string' ? requirement.description : '';
            const requirementId = requirement.id;
            const descriptionId = `${id}-description-${requirementId}`;
            const errorId = `${descriptionId}-error`;
            const hasDescription = description.trim().length > 0;
            const showRowError =
              !hasDescription && (submittedRowIds.has(requirementId) || touchedRowIds.has(requirementId));

            return (
              <div
                key={requirementId}
                className={`p-2 rounded-3 border ${requirement.hasAllergies ? 'mh-requirement-allergy' : 'bg-body'}`}
              >
                <div className="row g-2 align-items-center">
                  <div className="col-auto order-1">
                    <Form.Check
                      id={`${id}-allergy-${requirementId}`}
                      label={
                        <span className="d-flex align-items-center gap-1">
                          <TriangleAlert aria-hidden="true" size={16} />
                          Allergies
                        </span>
                      }
                      checked={requirement.hasAllergies === true}
                      onChange={(event) =>
                        updateRequirement(requirementId, 'hasAllergies', event.target.checked)
                      }
                      className="d-flex align-items-center gap-2 mb-0"
                    />
                  </div>
                  <Form.Group controlId={descriptionId} className="col-12 col-sm order-3 order-sm-2 mb-0">
                    <Form.Label className="visually-hidden">Description for requirement {index + 1}</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder={requirement.hasAllergies ? 'e.g. 1 peanut allergy' : 'e.g. 2 vegetarians'}
                      value={description}
                      onChange={(event) => updateRequirement(requirementId, 'description', event.target.value)}
                      onBlur={() => {
                        setTouchedRowIds((current) => new Set(current).add(requirementId));
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
                      onClick={() => removeRequirement(requirementId)}
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

  return (
    <section className="mt-4" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="d-flex align-items-center gap-2 h5">
        <Utensils aria-hidden="true" size={18} />
        Dietary needs and allergies
      </h2>
      <ul className="list-unstyled d-grid gap-2 mb-0">
        {items.map((requirement, index) => (
          <li key={index} className="d-flex align-items-start gap-2">
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
