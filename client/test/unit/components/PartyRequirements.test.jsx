// MH-05 FT1 – unit tests of the party requirements editor and of their display (MH-05 FE1), written from the story
// (MH-05 Notes and Clarifications, PO issues #4 and #29) and the contract (openapi Requirement):
// a list per booking, each with an allergies checkbox and a description; an empty description is refused.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PartyRequirements, { PartyRequirementsTextDisplay } from '../../../src/components/PartyRequirements.jsx';

// The example of the PO (MH-05 clarifications): three requirements, two with allergies.
const PO_EXAMPLE = [
  { hasAllergies: true, description: '1 vegan, peanut allergy' },
  { hasAllergies: true, description: '1 shellfish allergy' },
  { hasAllergies: false, description: '2 vegetarians' },
];

/** The list without the editor's own row ids (`id`): what the page sends to the server (openapi Requirement). */
const withoutIds = (list) => list.map(({ hasAllergies, description }) => ({ hasAllergies, description }));

/**
 * The editor as a page uses it: the page keeps the list; `changes` records every list it receives, without ids.
 * The editor tells its rows apart by an `id` on each requirement (it adds one to the rows created with Add):
 * a page that starts from existing requirements gives them an id, as done here with `initial`.
 */
function Editor({ initial = [], submitAttempt = 0, editorRef, changes }) {
  const [requirements, setRequirements] = useState(() => initial.map((r, i) => ({ id: `row-${i}`, ...r })));
  return (
    <PartyRequirements
      ref={editorRef}
      value={requirements}
      submitAttempt={submitAttempt}
      onChange={(next) => {
        changes?.(withoutIds(next));
        setRequirements(next);
      }}
    />
  );
}

const descriptions = () => screen.queryAllByRole('textbox');
const allergyBoxes = () => screen.queryAllByRole('checkbox', { name: /Allergies/ });
const addButton = () => screen.getByRole('button', { name: /Add/ });
const description = (n) => screen.getByLabelText(`Description for requirement ${n}`);

describe('PartyRequirements (editor)', () => {
  it('is an optional group "Dietary needs and allergies" that starts with no requirement', () => {
    render(<Editor />);
    const group = screen.getByRole('group', { name: /Dietary needs and allergies/ });
    expect(group).toHaveTextContent('(optional)');
    expect(descriptions()).toHaveLength(0);
    expect(addButton()).toBeInTheDocument();
  });

  it('Add adds an empty requirement without allergies, and no error is shown yet', async () => {
    const changes = vi.fn();
    render(<Editor changes={changes} />);

    await userEvent.click(addButton());

    expect(changes).toHaveBeenLastCalledWith([{ hasAllergies: false, description: '' }]);
    expect(description(1)).toHaveValue('');
    expect(description(1)).not.toHaveAttribute('aria-invalid');
    expect(allergyBoxes()[0]).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Remove requirement 1' })).toBeInTheDocument();
  });

  it('builds the PO example: three requirements, two with the allergies box ticked', async () => {
    const changes = vi.fn();
    render(<Editor changes={changes} />);

    for (const [i, { hasAllergies, description: text }] of PO_EXAMPLE.entries()) {
      await userEvent.click(addButton());
      await userEvent.type(description(i + 1), text);
      if (hasAllergies) await userEvent.click(allergyBoxes()[i]);
    }

    expect(changes).toHaveBeenLastCalledWith(PO_EXAMPLE);
    expect(allergyBoxes().map((box) => box.checked)).toEqual([true, true, false]);
  });

  it('the allergies box can be ticked and unticked again', async () => {
    const changes = vi.fn();
    render(<Editor initial={[{ hasAllergies: false, description: '1 nut allergy' }]} changes={changes} />);

    await userEvent.click(allergyBoxes()[0]);
    expect(changes).toHaveBeenLastCalledWith([{ hasAllergies: true, description: '1 nut allergy' }]);
    await userEvent.click(allergyBoxes()[0]);
    expect(changes).toHaveBeenLastCalledWith([{ hasAllergies: false, description: '1 nut allergy' }]);
  });

  it('Remove takes away only that requirement, and the others keep their text and box', async () => {
    const changes = vi.fn();
    render(<Editor initial={PO_EXAMPLE} changes={changes} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove requirement 2' }));

    expect(changes).toHaveBeenLastCalledWith([PO_EXAMPLE[0], PO_EXAMPLE[2]]);
    expect(descriptions().map((field) => field.value)).toEqual(['1 vegan, peanut allergy', '2 vegetarians']);
    expect(allergyBoxes().map((box) => box.checked)).toEqual([true, false]);
  });

  it('removing every requirement leaves none (they are optional)', async () => {
    const changes = vi.fn();
    render(<Editor initial={[PO_EXAMPLE[2]]} changes={changes} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove requirement 1' }));
    expect(changes).toHaveBeenLastCalledWith([]);
    expect(descriptions()).toHaveLength(0);
  });

  it('refuses an empty description when the field is left: the error is next to it', async () => {
    render(<Editor />);
    await userEvent.click(addButton());
    await userEvent.click(description(1));
    await userEvent.tab();

    expect(description(1)).toHaveAttribute('aria-invalid', 'true');
    expect(description(1)).toHaveAccessibleDescription('Enter a description for requirement 1.');
  });

  it('refuses a description of spaces only, and the error goes away once there is text', async () => {
    render(<Editor />);
    await userEvent.click(addButton());
    await userEvent.type(description(1), '   ');
    await userEvent.tab();
    expect(description(1)).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(description(1), '2 vegetarians');
    expect(description(1)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Enter a description/)).not.toBeInTheDocument();
  });

  it('after a submit, shows the error on the empty rows, but not on a row added afterwards', () => {
    const { rerender } = render(
      <Editor initial={[PO_EXAMPLE[0], { hasAllergies: false, description: '' }]} submitAttempt={0} />,
    );
    expect(screen.queryByText(/Enter a description/)).not.toBeInTheDocument();

    rerender(<Editor initial={[PO_EXAMPLE[0], { hasAllergies: false, description: '' }]} submitAttempt={1} />);
    expect(description(2)).toHaveAccessibleDescription('Enter a description for requirement 2.');
    expect(description(1)).not.toHaveAttribute('aria-invalid');
  });

  it('a row added after a submit starts without error', async () => {
    const { rerender } = render(<Editor initial={[{ hasAllergies: false, description: '' }]} submitAttempt={0} />);
    rerender(<Editor initial={[{ hasAllergies: false, description: '' }]} submitAttempt={1} />);
    expect(description(1)).toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(addButton());
    expect(description(2)).not.toHaveAttribute('aria-invalid');
  });

  it('can move the focus to the first empty description (used by the page on submit)', () => {
    const editorRef = createRef();
    render(
      <Editor
        editorRef={editorRef}
        initial={[PO_EXAMPLE[0], { hasAllergies: true, description: ' ' }, { hasAllergies: false, description: '' }]}
      />,
    );
    editorRef.current.focusFirstEmptyDescription();
    expect(description(2)).toHaveFocus();
  });

  it('moves the focus nowhere when every description is filled in', () => {
    const editorRef = createRef();
    render(<Editor editorRef={editorRef} initial={PO_EXAMPLE} />);
    editorRef.current.focusFirstEmptyDescription();
    expect(document.body).toHaveFocus();
  });

  it('follows a list changed by the page (more rows, then fewer)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PartyRequirements value={[]} onChange={onChange} />);
    rerender(<PartyRequirements value={PO_EXAMPLE} onChange={onChange} />);
    expect(descriptions().map((field) => field.value)).toEqual(PO_EXAMPLE.map((r) => r.description));
    rerender(<PartyRequirements value={[PO_EXAMPLE[1]]} onChange={onChange} />);
    expect(descriptions().map((field) => field.value)).toEqual(['1 shellfish allergy']);
  });

  it('shows no row when the value is not a list, and treats a non-text description as empty', () => {
    const { rerender } = render(<PartyRequirements value={undefined} onChange={vi.fn()} />);
    expect(descriptions()).toHaveLength(0);
    rerender(<PartyRequirements value={[{ hasAllergies: false, description: null }]} onChange={vi.fn()} />);
    expect(description(1)).toHaveValue('');
  });
});

describe('PartyRequirementsTextDisplay (confirmation)', () => {
  it('shows nothing when there are no requirements', () => {
    const { container, rerender } = render(<PartyRequirementsTextDisplay requirements={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PartyRequirementsTextDisplay />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PartyRequirementsTextDisplay requirements={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the requirements in order, the ones with allergies marked "Allergies", the others "Diet"', () => {
    render(<PartyRequirementsTextDisplay requirements={PO_EXAMPLE} />);
    const section = screen.getByRole('region', { name: 'Dietary needs and allergies' });
    const items = within(section).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Allergies1 vegan, peanut allergy',
      'Allergies1 shellfish allergy',
      'Diet2 vegetarians',
    ]);
  });

  it('shows two identical requirements twice', () => {
    render(<PartyRequirementsTextDisplay requirements={[PO_EXAMPLE[2], PO_EXAMPLE[2]]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
