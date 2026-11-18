// MH-07 FT2 – the page of the reset link (/reset-password?token=…), from the story (recovery by email), PO #44
// (link valid 24 hours) and the contract of POST /api/auth/password-reset/confirm (204; 400 for a short password
// or for a link that is unknown, used or expired; the user is not logged in by the call and every session of that
// user is logged out).
//
// CONTRACT
//   F4 Without a token: a message and a way to ask for a new link, and no form (it could not work).
//      Client checks before any request: new password (at least 8 characters, at most 128) and its confirmation.
//      The token of the address and the new password are sent. 400 for a bad or expired link → its message and a
//      way to ask for a new link, no form; 400 for the password → error on the field; other errors → alert, the
//      form stays. One request at a time. Success → a message and a link to log in; nobody is logged in
//      afterwards in this browser.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import PageLayout from '../../../src/components/PageLayout.jsx';
import ResetPasswordPage from '../../../src/pages/auth/ResetPasswordPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

const TOKEN = '7f3c9a0b1d2e';
const NEW = 'my-own-secret-pw';
const BAD_LINK = 'This link is not valid or has expired: ask for a new one';

function renderReset(url = `/reset-password?token=${TOKEN}`, layout) {
  renderPage(<ResetPasswordPage />, { path: '/reset-password', url, layout });
}

async function fields() {
  return { next: await screen.findByLabelText('New password'), confirm: screen.getByLabelText('Confirm new password') };
}

async function fillAndSubmit({ next = NEW, confirm = next } = {}) {
  const f = await fields();
  if (next) await userEvent.type(f.next, next);
  if (confirm) await userEvent.type(f.confirm, confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
  return f;
}

function expectNoForm() {
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Confirm new password')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
}

const askAgainLink = () => screen.findByRole('link', { name: /new link/i });

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
  });

  describe('without a token', () => {
    it.each(['/reset-password', '/reset-password?token='])('%s: a message and a way to ask for a new link, no form', async (url) => {
      renderReset(url);
      expect(await askAgainLink()).toHaveAttribute('href', '/forgot-password');
      expect(screen.getByRole('alert')).toHaveTextContent(/link/i);
      expectNoForm();
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('client checks', () => {
    it('shows the form with two required password fields', async () => {
      renderReset();
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      const f = await fields();
      for (const field of Object.values(f)) {
        expect(field).toBeRequired();
        expect(field).toHaveAttribute('type', 'password');
      }
      expect(f.next).toHaveAccessibleDescription(/at least 8 characters/i);
    });

    it('an empty submit: errors on both fields, focus on the first, no request', async () => {
      renderReset();
      await screen.findByLabelText('New password');
      await userEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
      const f = await fields();
      expect(f.next).toHaveAttribute('aria-invalid', 'true');
      expect(f.confirm).toHaveAttribute('aria-invalid', 'true');
      expect(f.next).toHaveFocus();
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('a password shorter than 8 characters is refused on the field', async () => {
      renderReset();
      const f = await fillAndSubmit({ next: '1234567' });
      expect(f.next).toHaveAccessibleDescription(/at least 8 characters/i);
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('a password longer than 128 characters is refused on the field', async () => {
      renderReset();
      const f = await fields();
      await userEvent.click(f.next);
      await userEvent.paste('a'.repeat(129));
      await userEvent.click(f.confirm);
      await userEvent.paste('a'.repeat(129));
      await userEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
      expect(f.next).toHaveAccessibleDescription(/128 characters or fewer/i);
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('a different confirmation is refused on the confirmation field', async () => {
      renderReset();
      const f = await fillAndSubmit({ confirm: `${NEW}x` });
      expect(f.confirm).toHaveAccessibleDescription(/do not match/i);
      expect(f.confirm).toHaveFocus();
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('server answers', () => {
    it('sends the token of the address (decoded) and the password as typed', async () => {
      vi.mocked(authApi.confirmPasswordReset).mockResolvedValue(null);
      renderReset('/reset-password?token=a%2Bb%3Dc');
      await fillAndSubmit({ next: ' my pass word ' });
      expect(authApi.confirmPasswordReset).toHaveBeenCalledWith('a+b=c', ' my pass word ');
    });

    it('400 bad or expired link: its message and a way to ask for a new link, no form', async () => {
      vi.mocked(authApi.confirmPasswordReset).mockRejectedValue(new ApiError(400, BAD_LINK));
      renderReset();
      await fillAndSubmit();
      expect(await askAgainLink()).toHaveAttribute('href', '/forgot-password');
      expect(screen.getByRole('alert')).toHaveTextContent(BAD_LINK);
      expectNoForm();
    });

    it('400 for the password: the error is on the new password field', async () => {
      vi.mocked(authApi.confirmPasswordReset).mockRejectedValue(
        new ApiError(400, 'Password must be at least 8 characters long'),
      );
      renderReset();
      const f = await fillAndSubmit();
      await waitFor(() => expect(f.next).toHaveAccessibleDescription(/at least 8 characters long\./));
      expect(f.next).toHaveFocus();
      expect(screen.queryByRole('link', { name: /new link/i })).not.toBeInTheDocument();
    });

    it.each([
      ['a server error', new ApiError(500, 'Something went wrong. Please try again.')],
      ['no connection', new ApiError(0, 'Cannot reach the server.')],
    ])('%s: an alert with the focus; the form stays and can be sent again', async (_case, error) => {
      vi.mocked(authApi.confirmPasswordReset).mockRejectedValueOnce(error).mockResolvedValueOnce(null);
      renderReset();
      await fillAndSubmit();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(error.message);
      await waitFor(() => expect(alert).toHaveFocus());
      await userEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
      expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
      expect(authApi.confirmPasswordReset).toHaveBeenCalledTimes(2);
    });

    it('one request at a time: the button is disabled while saving', async () => {
      let finish;
      vi.mocked(authApi.confirmPasswordReset).mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderReset();
      const f = await fillAndSubmit();
      expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
      await userEvent.type(f.confirm, '{Enter}');
      expect(authApi.confirmPasswordReset).toHaveBeenCalledTimes(1);
      finish(null);
      expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    });
  });

  describe('success', () => {
    it('says the password is changed and links to the login; the form is gone', async () => {
      vi.mocked(authApi.confirmPasswordReset).mockResolvedValue(null);
      renderReset();
      await fillAndSubmit();
      expect(await screen.findByRole('status')).toHaveTextContent(/password has been changed/i);
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
      expectNoForm();
    });

    it('a user logged in in this browser is logged out (the server ended the sessions)', async () => {
      vi.mocked(authApi.me).mockResolvedValue(hiker);
      vi.mocked(authApi.confirmPasswordReset).mockResolvedValue(null);
      renderReset(`/reset-password?token=${TOKEN}`, <PageLayout />);
      const navbar = screen.getByRole('navigation');
      expect(await within(navbar).findByText('Hannah')).toBeInTheDocument();

      await fillAndSubmit();

      expect(await within(navbar).findByRole('link', { name: 'Log in' })).toBeInTheDocument();
      expect(within(navbar).queryByText('Hannah')).not.toBeInTheDocument();
      expect(authApi.login).not.toHaveBeenCalled();
    });

    // The server ends the sessions of the link's user only. Here the link is Hannah's, but Eric (staff) is logged
    // in this browser: the server keeps his session (me() still answers Eric), so the page must not log him out.
    it("another user logged in this browser stays logged in (only the link's user is logged out)", async () => {
      const eric = { ...hiker, id: 2, firstName: 'Eric', email: 'employee@example.com', role: 'employee' };
      vi.mocked(authApi.me).mockResolvedValue(eric);
      vi.mocked(authApi.confirmPasswordReset).mockResolvedValue(null);
      renderReset(`/reset-password?token=${TOKEN}`, <PageLayout />);
      const navbar = screen.getByRole('navigation');
      expect(await within(navbar).findByText('Eric')).toBeInTheDocument();

      await fillAndSubmit();
      expect(await screen.findByRole('status')).toHaveTextContent(/password has been changed/i);

      await waitFor(() => expect(within(navbar).getByText('Eric')).toBeInTheDocument());
      expect(within(navbar).queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    });
  });
});
