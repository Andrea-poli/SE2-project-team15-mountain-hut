// MH-07 FT2 – the page of the reset link (/reset-password?token=…), from the story (recovery by email), PO #44
// (link valid 24 hours) and the contract of GET /api/auth/password-reset/validity (200 valid, 400 missing /
// unknown / used / expired; called on load, never consumes the link) and POST /api/auth/password-reset/confirm
// (204; 400; the user is not logged in by the call and every session of that user is logged out).
//
// CONTRACT
//   F4 Without a token: a message and a way to ask for a new link, and no form (it could not work), no request.
//      With a token the link is checked on load: "Loading" meanwhile, then the form for a valid link; for a bad
//      link (400) its message and a way to ask for a new link, no form, without typing anything. Only the answer
//      about the link now in the address counts (a late answer about a previous link is ignored).
//      Client checks before any request: new password (at least 8 characters, at most 128) and its confirmation.
//      The token of the address and the new password are sent. Any 400 from confirm → bad-link message and a way
//      to ask for a new link, no form (the password was checked already: only the link can be wrong); other
//      errors → alert, the form stays. One request at a time. Success → a message and a link to log in; nobody
//      is logged in afterwards in this browser.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
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
  checkPasswordResetToken: vi.fn(),
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
    vi.mocked(authApi.checkPasswordResetToken).mockResolvedValue(null); // 200: a valid link, unless a test says else
  });

  describe('without a token', () => {
    it.each(['/reset-password', '/reset-password?token='])('%s: a message and a way to ask for a new link, no form', async (url) => {
      renderReset(url);
      expect(await askAgainLink()).toHaveAttribute('href', '/forgot-password');
      expect(screen.getByRole('alert')).toHaveTextContent(/link/i);
      expectNoForm();
      expect(authApi.checkPasswordResetToken).not.toHaveBeenCalled();
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('the link is checked on load', () => {
    it('shows "Loading" while checking, then the form for a valid link', async () => {
      let answer;
      vi.mocked(authApi.checkPasswordResetToken).mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderReset('/reset-password?token=a%2Bb%3Dc');
      expect(await screen.findByRole('status')).toHaveTextContent(/loading/i);
      expectNoForm();
      expect(authApi.checkPasswordResetToken).toHaveBeenCalledWith('a+b=c');

      answer(null);
      expect(await screen.findByLabelText('New password')).toBeInTheDocument();
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('a bad link (400): its message and a way to ask for a new link at once, no form, no confirm', async () => {
      vi.mocked(authApi.checkPasswordResetToken).mockRejectedValue(new ApiError(400, BAD_LINK));
      renderReset();
      expect(await askAgainLink()).toHaveAttribute('href', '/forgot-password');
      expect(screen.getByRole('alert')).toHaveTextContent(BAD_LINK);
      expectNoForm();
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('checking the link sends nothing else (it is not a use of the link)', async () => {
      renderReset();
      await screen.findByLabelText('New password');
      expect(authApi.checkPasswordResetToken).toHaveBeenCalledTimes(1);
      expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
    });

    // Opening a second link while the first one is still being checked: only the answer about the link in the
    // address counts, whatever the order the two answers arrive in.
    it.each([
      ['old link bad, new link valid → the form', false, true],
      ['old link valid, new link bad → the bad-link message', true, false],
    ])('a late answer about a previous link is ignored (%s)', async (_case, oldValid, newValid) => {
      const answers = {};
      vi.mocked(authApi.checkPasswordResetToken).mockImplementation(
        (token) => new Promise((resolve, reject) => (answers[token] = { resolve, reject })),
      );
      renderPage(
        <>
          <ResetPasswordPage />
          <Link to="/reset-password?token=new">Open the new link</Link>
        </>,
        { path: '/reset-password', url: '/reset-password?token=old' },
      );
      await waitFor(() => expect(answers.old).toBeDefined());
      await userEvent.click(screen.getByRole('link', { name: 'Open the new link' }));
      await waitFor(() => expect(answers.new).toBeDefined());

      const settle = (token, valid) =>
        valid ? answers[token].resolve(null) : answers[token].reject(new ApiError(400, BAD_LINK));
      await act(async () => settle('new', newValid));
      await act(async () => settle('old', oldValid));

      if (newValid) {
        expect(screen.getByLabelText('New password')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('alert')).toHaveTextContent(BAD_LINK);
        expectNoForm();
      }
    });

    // The link may be fine: the page only could not reach the server. It must say so, not call the link invalid.
    it('no connection during the check: says the server cannot be reached, not that the link is invalid', async () => {
      vi.mocked(authApi.checkPasswordResetToken).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
      renderReset();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Cannot reach the server.');
      expect(alert).not.toHaveTextContent(/not valid|expired/i);
      expectNoForm();
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

    // Changed on purpose (617a7fb): the password is checked before sending, so every 400 of confirm is the link
    // (used in another tab, or expired while typing).
    it('any other 400 from confirm is treated as a bad link too', async () => {
      vi.mocked(authApi.confirmPasswordReset).mockRejectedValue(
        new ApiError(400, 'Password must be at least 8 characters long'),
      );
      renderReset();
      await fillAndSubmit();
      expect(await askAgainLink()).toHaveAttribute('href', '/forgot-password');
      expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters long');
      expectNoForm();
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
