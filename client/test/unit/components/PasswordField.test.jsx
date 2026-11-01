import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PasswordField from '../../../src/components/PasswordField.jsx';

function renderField(props = {}) {
  render(
    // noValidate as in the pages: otherwise the browser blocks the submit of an empty required field.
    <form noValidate onSubmit={(e) => e.preventDefault()}>
      <PasswordField id="pw" label="Password" toggleLabel="Show password" required {...props} />
      <button type="submit">Send</button>
    </form>,
  );
  return {
    input: screen.getByLabelText('Password'),
    toggle: screen.getByRole('button', { name: 'Show password' }),
  };
}

describe('PasswordField', () => {
  it('is a required password input linked to its label, hidden at first', () => {
    const { input, toggle } = renderField();
    expect(input).toHaveAttribute('id', 'pw');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toBeRequired();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'pw');
    expect(toggle).toHaveAttribute('type', 'button'); // never submits the form
  });

  it('toggles between hidden and shown, with a fixed accessible name', async () => {
    const { input, toggle } = renderField();
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAccessibleName('Show password');
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('can be used with the keyboard', async () => {
    const { input, toggle } = renderField();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('hides the password again when the form is submitted', async () => {
    const { input, toggle } = renderField();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows the error and the help text, linked to the input', () => {
    const { input } = renderField({ error: 'Enter a password.', help: 'At least 8 characters' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a password. At least 8 characters');
  });

  it('turns off autocapitalize, autocorrect and spell check (the password may be shown as text)', () => {
    const { input } = renderField();
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });
});
