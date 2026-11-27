// MH-10 FT1 – UnavailableButton: a button that cannot be used now, shown with the reason (the menu of a slot that has
// started). It stays in the page and in the Tab order: aria-disabled="true" (not the disabled attribute), the reason
// as its accessible description and in a tooltip on hover and on keyboard focus; a click does nothing.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UnavailableButton from '../../../src/components/UnavailableButton.jsx';

const REASON = 'This slot has started: a menu can no longer be added.';

function renderButton(props = {}) {
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <UnavailableButton reason={REASON} {...props}>
        Add menu
      </UnavailableButton>
    </form>,
  );
  return { onSubmit, button: screen.getByRole('button', { name: 'Add menu' }) };
}

describe('UnavailableButton', () => {
  it('is aria-disabled, not disabled, and has the reason as its description', () => {
    const { button } = renderButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAccessibleDescription(REASON);
  });

  it('shows the reason in a tooltip on hover', async () => {
    const user = userEvent.setup();
    const { button } = renderButton();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(button);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('shows the reason in a tooltip on keyboard focus (it stays in the Tab order)', async () => {
    const user = userEvent.setup();
    const { button } = renderButton();

    await user.tab();

    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('a click does nothing: no onClick, no form submit', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { button, onSubmit } = renderButton({ onClick, type: 'submit' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');

    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps its own class names and passes the other props to the button', () => {
    const { button } = renderButton({ className: 'w-100', title: 'Add a menu', 'data-slot': '5' });
    expect(button).toHaveClass('w-100');
    expect(button).toHaveAttribute('title', 'Add a menu');
    expect(button).toHaveAttribute('data-slot', '5');
  });
});
