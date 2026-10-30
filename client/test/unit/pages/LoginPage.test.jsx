import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import LoginPage from '../../../src/pages/public/LoginPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

const notLoggedIn = new ApiError(401, 'Not logged in');

function renderLogin(url = '/login') {
  renderPage(<LoginPage />, { path: '/login', url });
}

async function fillAndSubmit(email, password) {
  // The form appears after the startup check (GET /api/auth/me).
  const button = await screen.findByRole('button', { name: 'Log in' });
  if (email) await userEvent.type(screen.getByLabelText('Email'), email);
  if (password) await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(button);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(notLoggedIn);
  });

  it('shows a form with labelled, required email and password fields', async () => {
    renderLogin();
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows and hides the password with the toggle, and hides it again on submit', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    renderLogin();
    const toggle = await screen.findByRole('button', { name: 'Show password' });
    const password = screen.getByLabelText('Password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.type(password, 'hikerpass');
    await userEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(password).toHaveFocus(); // a mouse click on the toggle keeps the focus in the field
    await userEvent.type(screen.getByLabelText('Email'), 'hiker@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('on an empty submit shows the errors next to the fields and focuses the first one', async () => {
    renderLogin();
    await fillAndSubmit();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAccessibleDescription('Enter your email.');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(email).toHaveFocus();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('refuses a malformed email without calling the server', async () => {
    renderLogin();
    await fillAndSubmit('mario@', 'hikerpass');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email, e.g. name@example.com.',
    );
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('removes a field error on blur once the value is fixed', async () => {
    renderLogin();
    await fillAndSubmit(undefined, 'hikerpass');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAccessibleDescription('Enter your email.');
    await userEvent.type(email, 'hiker@example.com');
    await userEvent.tab();
    expect(email).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter your email.')).not.toBeInTheDocument();
  });

  it('on wrong credentials (401) shows the server message, clears the password and focuses the message', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    renderLogin();
    await fillAndSubmit('hiker@example.com', 'wrongpass');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('hiker@example.com');
  });

  it('shows a network error and keeps the password', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    renderLogin();
    await fillAndSubmit('hiker@example.com', 'hikerpass');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.getByLabelText('Password')).toHaveValue('hikerpass');
  });

  it('sends the trimmed email and the password as typed', async () => {
    vi.mocked(authApi.login).mockResolvedValue(hiker);
    renderLogin();
    await fillAndSubmit('  hiker@example.com ', ' pass word ');
    expect(authApi.login).toHaveBeenCalledWith('hiker@example.com', ' pass word ');
  });

  it('disables the button while logging in, so the form is sent once', async () => {
    let finish;
    vi.mocked(authApi.login).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderLogin();
    await fillAndSubmit('hiker@example.com', 'hikerpass');
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
    finish(hiker);
    expect(await screen.findByText('Landed on /')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledTimes(1);
  });

  it('after login goes to next when the role may open it', async () => {
    vi.mocked(authApi.login).mockResolvedValue(hiker);
    renderLogin('/login?next=%2Fbook%3FslotId%3D3');
    await fillAndSubmit('hiker@example.com', 'hikerpass');
    expect(await screen.findByText('Landed on /book?slotId=3')).toBeInTheDocument();
  });

  it('after login sends staff to the slots, not to a hiker page', async () => {
    vi.mocked(authApi.login).mockResolvedValue(employee);
    renderLogin('/login?next=%2Fbook');
    await fillAndSubmit('employee@example.com', 'employeepass');
    expect(await screen.findByText('Landed on /staff/slots')).toBeInTheDocument();
  });

  it('never redirects to another site', async () => {
    vi.mocked(authApi.login).mockResolvedValue(hiker);
    renderLogin('/login?next=%2F%2Fevil.example');
    await fillAndSubmit('hiker@example.com', 'hikerpass');
    expect(await screen.findByText('Landed on /')).toBeInTheDocument();
  });

  it('sends away a user who is already logged in', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderLogin('/login?next=%2Fbook');
    expect(await screen.findByText('Landed on /book')).toBeInTheDocument();
  });

  it('keeps next in the link to the register page', async () => {
    renderLogin('/login?next=%2Fbook');
    expect(await screen.findByRole('link', { name: 'Register' })).toHaveAttribute(
      'href',
      '/register?next=%2Fbook',
    );
  });
});
