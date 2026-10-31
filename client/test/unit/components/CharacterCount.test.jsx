// Character count under a text field (FormField characterLimit). The tests use a limit of 10.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CharacterCount from '../../../src/components/CharacterCount.jsx';
import FormField from '../../../src/components/FormField.jsx';

function renderField(value) {
  return render(<FormField id="notes" label="Notes" characterLimit={10} value={value} onChange={() => {}} />);
}

const count = (container) => container.querySelector('#notes-count');
const liveRegion = (container) => container.querySelector('[aria-live="polite"]');

describe('CharacterCount', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the limit at first and is part of the field description', () => {
    const { container } = renderField('');
    expect(count(container)).toHaveTextContent('You have 10 characters remaining');
    expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('You have 10 characters remaining');
  });

  it('uses the singular for one character, the plural otherwise', () => {
    const { container, rerender } = renderField('a'.repeat(9));
    expect(count(container)).toHaveTextContent('You have 1 character remaining');
    rerender(<FormField id="notes" label="Notes" characterLimit={10} value={'a'.repeat(11)} onChange={() => {}} />);
    expect(count(container)).toHaveTextContent('You have 1 character too many');
    rerender(<FormField id="notes" label="Notes" characterLimit={10} value={'a'.repeat(12)} onChange={() => {}} />);
    expect(count(container)).toHaveTextContent('You have 2 characters too many');
    rerender(<FormField id="notes" label="Notes" characterLimit={10} value={'a'.repeat(10)} onChange={() => {}} />);
    expect(count(container)).toHaveTextContent('You have 0 characters remaining');
  });

  it('does not count the spaces at the ends, like the form checks', () => {
    const { container } = renderField(`  ${'a'.repeat(10)}  `);
    expect(count(container)).toHaveTextContent('You have 0 characters remaining');
  });

  it('turns to mh-char-count-over only past the limit', () => {
    const { container, rerender } = renderField('a'.repeat(10));
    expect(count(container)).not.toHaveClass('mh-char-count-over');
    rerender(<FormField id="notes" label="Notes" characterLimit={10} value={'a'.repeat(11)} onChange={() => {}} />);
    expect(count(container)).toHaveClass('mh-char-count-over');
  });

  it('keeps the live region empty when the page opens and updates it only after a 500 ms pause', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CharacterCount id="c" value="" limit={10} />);
    expect(liveRegion(container)).toBeEmptyDOMElement();

    rerender(<CharacterCount id="c" value="a" limit={10} />);
    act(() => vi.advanceTimersByTime(499));
    expect(liveRegion(container)).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1));
    expect(liveRegion(container)).toHaveTextContent('You have 9 characters remaining');

    // Typing again restarts the wait: only the text of the last pause is announced.
    rerender(<CharacterCount id="c" value="ab" limit={10} />);
    act(() => vi.advanceTimersByTime(300));
    rerender(<CharacterCount id="c" value="abc" limit={10} />);
    act(() => vi.advanceTimersByTime(300));
    expect(liveRegion(container)).toHaveTextContent('You have 9 characters remaining');
    act(() => vi.advanceTimersByTime(200));
    expect(liveRegion(container)).toHaveTextContent('You have 7 characters remaining');
  });
});
