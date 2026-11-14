import { useId } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

export default function PartyRequirementsForm({ value, onChange }) {
  const id = useId();
  const requirements = Array.isArray(value) ? value : [];

  function updateRequirement(index, field, fieldValue) {
    onChange(
      requirements.map((requirement, itemIndex) => ({
        hasAllergies: itemIndex === index && field === 'hasAllergies' ? fieldValue : requirement.hasAllergies,
        description: itemIndex === index && field === 'description' ? fieldValue : requirement.description,
      })),
    );
  }

  return (
    <fieldset className="mb-3">
      <legend className="h5">Party requirements</legend>
      <p className="mb-3">Add dietary requirements or allergies for people in your party. This is optional.</p>
      {requirements.length > 0 && (
        <div className="d-grid gap-3 mb-3">
          {requirements.map((requirement, index) => {
            const description = typeof requirement.description === 'string' ? requirement.description : '';
            const descriptionId = `${id}-description-${index}`;
            const errorId = `${descriptionId}-error`;
            const hasDescription = description.trim().length > 0;

            return (
              <div
                key={index}
                className={`p-3 rounded-3 border ${requirement.hasAllergies ? 'mh-requirement-allergy' : 'bg-body'}`}
              >
                <div className="d-flex align-items-center justify-content-between gap-3">
                  <Form.Check
                    id={`${id}-allergy-${index}`}
                    label={`Requirement ${index + 1} involves an allergy`}
                    checked={requirement.hasAllergies === true}
                    onChange={(event) => updateRequirement(index, 'hasAllergies', event.target.checked)}
                    className='d-flex align-items-center gap-2 mb-0'
                  />
                  <Button
                    type="button"
                    variant="outline-danger"
                    aria-label={`Remove requirement ${index + 1}`}
                    onClick={() => onChange(requirements.filter((_, itemIndex) => itemIndex !== index))}
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
                    isInvalid={!hasDescription}
                    aria-invalid={!hasDescription}
                    aria-describedby={!hasDescription ? errorId : undefined}
                    required
                  />
                  {!hasDescription && (
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
        onClick={() => onChange([...requirements, { hasAllergies: false, description: '' }])}
      >
        Add requirement
      </Button>
    </fieldset>
  );
}

export function PartyRequirementsTextDisplay({ requirements = [] }) {
  const id = useId();
  const items = Array.isArray(requirements) ? requirements : [];

  return (
    <section className="mt-4" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="h5">
        Party requirements
      </h2>
      {items.length === 0 ? (
        <p className="mb-0">No party requirements were provided.</p>
      ) : (
        <ul className="list-unstyled d-grid gap-2 mb-0">
          {items.map((requirement, index) => (
            <li
              key={index}
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
