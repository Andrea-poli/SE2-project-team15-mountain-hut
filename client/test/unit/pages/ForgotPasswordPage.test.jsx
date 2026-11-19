// MH-07 FT2 – Forgot password page, from the story ("the hiker can recover their password via email") and the
// contract of POST /api/auth/password-reset (always the same 202, so the page never reveals who has an account;
// 400 for an invalid email).
//
// CONTRACT
//   F3 An empty or invalid email is refused on the field, without a request. Any valid email (trimmed) is sent
//      and gets the same confirmation, whether or not it has an account. A server or network error is an alert;
//      the form stays. One request at a time. A way back to the login.
//   F5 The login page has a "Forgot your password?" link to this page.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import ForgotPasswordPage from '../../../src/pages/auth/ForgotPasswordPage.jsx';
import LoginPage from '../../../src/pages/public/LoginPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';

vi.mock('../../../src/api/auth.js', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

function renderForgot() {
  return renderPage(<ForgotPasswordPage />, { path: '/forgot-password' });
}

async function submit(email) {
  const field = await screen.findByLabelText('Email');
  if (email) await userEvent.type(field, email);
  await userEvent.click(screen.getByRole('button', { name: 'Send the link' }));
  return field;
}

/** The confirmation text with the email replaced, to compare two answers. */
const confirmationFor = async (email) =>
  (await screen.findByRole('status')).textContent.replace(email, '<email>');

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('asks for the email, with a way back to the login', async () => {
    renderForgot();
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByRole('link', { name: 'Back to log in' })).toHaveAttribute('href', '/login');
  });

  it.each([
    ['empty', '', /enter your email/i],
    ['invalid', 'mario@', /valid email/i],
  ])('an %s email: error on the field, focused, no request', async (_case, email, message) => {
    renderForgot();
    const field = await submit(email);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(message);
    expect(field).toHaveFocus();
    expect(authApi.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the trimmed email and shows the confirmation in place of the form', async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue(null);
    renderForgot();
    await submit('  hiker@example.com ');
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('hiker@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(/link/i);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to log in' })).toHaveAttribute('href', '/login');
  });

  it('gives the same confirmation for any valid email (the server answers 202 to all)', async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue(null);
    const { unmount } = renderForgot();
    await submit('hiker@example.com');
    const registered = await confirmationFor('hiker@example.com');
    unmount();

    renderForgot();
    await submit('nobody@example.com');
    expect(await confirmationFor('nobody@example.com')).toBe(registered);
  });

  it.each([
    ['refused by the server', new ApiError(400, 'Enter a valid email')],
    ['a server error', new ApiError(500, 'Something went wrong. Please try again.')],
    ['no connection', new ApiError(0, 'Cannot reach the server.')],
  ])('%s: an alert with the focus, and the form stays', async (_case, error) => {
    vi.mocked(authApi.requestPasswordReset).mockRejectedValue(error);
    renderForgot();
    await submit('hiker@example.com');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(error.message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Email')).toHaveValue('hiker@example.com');
    expect(screen.getByRole('button', { name: 'Send the link' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('one request at a time: the button is disabled while sending', async () => {
    let finish;
    vi.mocked(authApi.requestPasswordReset).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForgot();
    await submit('hiker@example.com');
    expect(screen.getByRole('button', { name: /Sending/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Email'), '{Enter}');
    expect(authApi.requestPasswordReset).toHaveBeenCalledTimes(1);
    finish(null);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  it('has a "Forgot your password?" link to the Forgot password page', async () => {
    renderPage(<LoginPage />, { path: '/login' });
    const link = await screen.findByRole('link', { name: 'Forgot your password?' });
    expect(link).toHaveAttribute('href', '/forgot-password');
    await userEvent.click(link);
    expect(await screen.findByText('Landed on /forgot-password')).toBeInTheDocument();
  });
});
