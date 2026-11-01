// useFormErrors: after a failed submit the focus goes to the first field with an error in the order
// of fieldIds (the form order), not the order of the keys returned by validate nor the DOM order.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFormErrors } from '../../../src/hooks/useFormErrors.js';

// Inputs a, b, c in the DOM; fieldIds lists them as c, b, a.
const FIELD_IDS = { c: 'field-c', b: 'field-b', a: 'field-a' };

function TestForm({ found, onResult }) {
  const { checkOnSubmit } = useFormErrors(() => found, FIELD_IDS);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onResult(checkOnSubmit({}));
      }}
    >
      <input id="field-a" aria-label="A" />
      <input id="field-b" aria-label="B" />
      <input id="field-c" aria-label="C" />
      <button type="submit">Submit</button>
    </form>
  );
}

async function submit(found) {
  const results = [];
  render(<TestForm found={found} onResult={(ok) => results.push(ok)} />);
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  return results[0];
}

describe('useFormErrors checkOnSubmit', () => {
  it('focuses the first field with an error in the order of fieldIds', async () => {
    // validate returns a before b, and a comes first in the DOM: b is first in fieldIds.
    expect(await submit({ a: 'Wrong a', b: 'Wrong b' })).toBe(false);
    expect(screen.getByLabelText('B')).toHaveFocus();
  });

  it('follows fieldIds also when the error is on the last field of the DOM', async () => {
    expect(await submit({ a: 'Wrong a', c: 'Wrong c' })).toBe(false);
    expect(screen.getByLabelText('C')).toHaveFocus();
  });

  it('returns true and moves no focus when there are no errors', async () => {
    expect(await submit({})).toBe(true);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
  });
});
