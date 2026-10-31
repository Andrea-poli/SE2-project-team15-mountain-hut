import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import RegisterPage from '../../../src/pages/public/RegisterPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

const valid = {
  'First name': 'Mario',
  'Last name': 'Rossi',
  Email: 'mario.rossi@example.com',
  Password: 'segretissimo',
  'Confirm password': 'segretissimo',
  'Mobile number': '3401234567', // national number, country Italy by default
};

function renderRegister(url = '/register') {
  renderPage(<RegisterPage />, { path: '/register', url });
}

// Types the given values (label → text) and submits. The form appears after the startup check.
async function fillAndSubmit(values = valid) {
  const button = await screen.findByRole('button', { name: 'Create account' });
  for (const [label, text] of Object.entries(values)) {
    if (text) await userEvent.type(screen.getByLabelText(label), text);
  }
  await userEvent.click(button);
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('shows labelled fields: six required, notes and emergency contact optional', async () => {
    renderRegister();
    expect(await screen.findByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument();
    for (const label of ['First name', 'Last name', 'Email', 'Password', 'Confirm password', 'Mobile number']) {
      expect(screen.getByLabelText(label), label).toBeRequired();
    }
    expect(screen.getByLabelText('Notes (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Emergency contact (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('IT');
  });

  it('on an empty submit flags every required field and focuses the first name', async () => {
    renderRegister();
    await fillAndSubmit({});
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription('Enter your first name.');
    expect(screen.getByLabelText('Last name')).toHaveAccessibleDescription('Enter your last name.');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/^Enter a password\./);
    expect(screen.getByLabelText('Confirm password')).toHaveAccessibleDescription('Confirm your password.');
    expect(screen.getByLabelText('Mobile number')).toHaveAccessibleDescription(/^Enter your mobile number\./);
    expect(screen.getByLabelText('First name')).toHaveFocus();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than 8 characters and focuses it', async () => {
    renderRegister();
    await fillAndSubmit({ ...valid, Password: 'short7c', 'Confirm password': 'short7c' });
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAccessibleDescription(/^The password must be at least 8 characters long\./);
    expect(password).toHaveFocus();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('accepts a password of exactly 8 characters', async () => {
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderRegister();
    await fillAndSubmit({ ...valid, Password: '12345678', 'Confirm password': '12345678' });
    expect(authApi.register).toHaveBeenCalledTimes(1);
  });

  it('refuses a confirmation that does not match the password', async () => {
    renderRegister();
    await fillAndSubmit({ ...valid, 'Confirm password': 'segretissimO' });
    const confirm = screen.getByLabelText('Confirm password');
    expect(confirm).toHaveAccessibleDescription('The passwords do not match.');
    expect(confirm).toHaveFocus();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('removes the mismatch error on blur once the confirmation is fixed', async () => {
    renderRegister();
    await fillAndSubmit({ ...valid, 'Confirm password': 'different' });
    const confirm = screen.getByLabelText('Confirm password');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'segretissimo');
    await userEvent.tab();
    expect(confirm).not.toHaveAttribute('aria-invalid');
  });

  it('shows and hides each password with its own toggle, and hides them again on submit', async () => {
    renderRegister();
    await screen.findByRole('button', { name: 'Create account' });
    const password = screen.getByLabelText('Password');
    const confirm = screen.getByLabelText('Confirm password');
    const showPassword = screen.getByRole('button', { name: 'Show password' });
    expect(showPassword).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(showPassword);
    expect(password).toHaveAttribute('type', 'text');
    expect(showPassword).toHaveAttribute('aria-pressed', 'true');
    expect(confirm).toHaveAttribute('type', 'password'); // the other field is not affected

    await userEvent.click(screen.getByRole('button', { name: 'Show confirmed password' }));
    expect(confirm).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
  });

  it('refuses a malformed email and a mobile number that cannot exist', async () => {
    renderRegister();
    await fillAndSubmit({ ...valid, Email: 'mario.rossi@', 'Mobile number': '12' });
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email, e.g. name@example.com.');
    expect(screen.getByLabelText('Mobile number')).toHaveAccessibleDescription(
      /^Enter a valid mobile number for the chosen country\./,
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('sends trimmed values, the phone in E.164, no confirmation and no empty optional fields', async () => {
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderRegister();
    await fillAndSubmit({ ...valid, 'First name': '  Mario ', Email: ' mario.rossi@example.com ' });
    expect(authApi.register).toHaveBeenCalledWith({
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario.rossi@example.com',
      password: 'segretissimo',
      phone: '+393401234567',
    });
  });

  it('sends the optional fields when they are filled', async () => {
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderRegister();
    await fillAndSubmit({
      ...valid,
      'Notes (optional)': 'registered mountain guide',
      'Emergency contact (optional)': 'Anna Rossi +39 333 1234567',
    });
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'registered mountain guide', emergencyContact: 'Anna Rossi +39 333 1234567' }),
    );
  });

  it('turns a pasted international number into the right country', async () => {
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderRegister();
    await screen.findByRole('button', { name: 'Create account' });
    const phone = screen.getByLabelText('Mobile number');
    fireEvent.paste(phone, { clipboardData: { getData: () => '+41 79 123 45 67' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('CH'));
    await fillAndSubmit({ ...valid, 'Mobile number': '' });
    expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ phone: '+41791234567' }));
  });

  it('on 409 shows "Email already in use" under the email and keeps it until the email changes', async () => {
    vi.mocked(authApi.register).mockRejectedValue(new ApiError(409, 'Email already in use'));
    renderRegister();
    await fillAndSubmit();
    const email = screen.getByLabelText('Email');
    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription('Email already in use');
    await waitFor(() => expect(email).toHaveFocus());

    await userEvent.tab(); // blur with the same email: the server error stays
    expect(email).toHaveAccessibleDescription('Email already in use');

    await userEvent.clear(email);
    await userEvent.type(email, 'mario.rossi2@example.com');
    await userEvent.tab(); // a different, valid email: the error goes away
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('shows other server errors as a general message with the focus on it', async () => {
    vi.mocked(authApi.register).mockRejectedValue(new ApiError(500, 'Something went wrong. Please try again.'));
    renderRegister();
    await fillAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('after registering (already logged in) goes to next', async () => {
    vi.mocked(authApi.register).mockResolvedValue(hiker);
    renderRegister('/register?next=%2Fbook%3FslotId%3D3');
    await fillAndSubmit();
    expect(await screen.findByText('Landed on /book?slotId=3')).toBeInTheDocument();
  });

  it('sends away a user who is already logged in', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderRegister();
    expect(await screen.findByText('Landed on /')).toBeInTheDocument();
  });

  it('keeps next in the link to the login page', async () => {
    renderRegister('/register?next=%2Fbook');
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fbook');
  });
});

// Fields with a maximum length (utils/validation.js, agreed with the team). Text is counted without the
// spaces at the ends, the password as typed. No maxLength attribute: the text is never cut.
const LIMITS = [
  { label: 'First name', key: 'firstName', max: 100, message: 'First name must be 100 characters or fewer.' },
  { label: 'Last name', key: 'lastName', max: 100, message: 'Last name must be 100 characters or fewer.' },
  { label: 'Password', key: 'password', max: 128, message: 'The password must be 128 characters or fewer.' },
  { label: 'Notes (optional)', key: 'notes', max: 500, message: 'Notes must be 500 characters or fewer.' },
  {
    label: 'Emergency contact (optional)',
    key: 'emergencyContact',
    max: 200,
    message: 'Emergency contact must be 200 characters or fewer.',
  },
];

// Fills the form with `text` in the field `label` (pasted: typing hundreds of characters is slow),
// the password also in the confirmation, the other fields valid; then submits.
async function submitWithLong(label, text) {
  await screen.findByRole('button', { name: 'Create account' });
  const pasted = label === 'Password' ? ['Password', 'Confirm password'] : [label];
  for (const name of pasted) {
    await userEvent.click(screen.getByLabelText(name));
    await userEvent.paste(text);
  }
  const others = Object.fromEntries(Object.entries(valid).filter(([name]) => !pasted.includes(name)));
  await fillAndSubmit(others);
}

describe('RegisterPage length limits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    vi.mocked(authApi.register).mockResolvedValue(hiker);
  });

  describe.each(LIMITS)('$label (at most $max characters)', ({ label, key, max, message }) => {
    it('sends the form with exactly the limit', async () => {
      renderRegister();
      await submitWithLong(label, 'a'.repeat(max));
      expect(authApi.register).toHaveBeenCalledTimes(1);
      expect(vi.mocked(authApi.register).mock.calls[0][0][key]).toHaveLength(max);
    });

    it('one character more: message, aria-invalid and focus on the field, nothing sent, text not cut', async () => {
      renderRegister();
      const text = 'a'.repeat(max + 1);
      await submitWithLong(label, text);
      const field = screen.getByLabelText(label);
      expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveFocus();
      expect(field).toHaveValue(text);
      expect(authApi.register).not.toHaveBeenCalled();
    });
  });

  it.each(LIMITS.filter(({ key }) => key !== 'password'))(
    '$label: spaces at the ends do not count and are not sent',
    async ({ label, key, max }) => {
      renderRegister();
      await submitWithLong(label, `  ${'a'.repeat(max)}  `);
      expect(authApi.register).toHaveBeenCalledTimes(1);
      expect(vi.mocked(authApi.register).mock.calls[0][0][key]).toBe('a'.repeat(max));
    },
  );

  it('counts the password as typed: spaces at the ends count and are sent', async () => {
    renderRegister();
    await submitWithLong('Password', ` ${'a'.repeat(127)}`);
    expect(vi.mocked(authApi.register).mock.calls[0][0].password).toBe(` ${'a'.repeat(127)}`);

    vi.mocked(authApi.register).mockClear();
    cleanup();
    renderRegister();
    await submitWithLong('Password', ` ${'a'.repeat(128)}`);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      expect.stringContaining('The password must be 128 characters or fewer.'),
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });
});
