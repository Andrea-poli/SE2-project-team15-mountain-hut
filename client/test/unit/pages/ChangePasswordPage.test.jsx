// MH-07 FT2 – Change password page, from the story (forced change after a generated password, PO #36) and the
// contract of PUT /api/auth/password (400 missing / short / same as current, 401 wrong current password,
// 200 the user with mustChangePassword false, still logged in).
//
// CONTRACT
//   F2 A forced change (mustChangePassword) explains why it is needed; a voluntary one does not.
//      Client checks before any request: current password, new password (at least 8 characters, at most 128),
//      confirmation equal to the new one; errors next to the fields, focus on the first.
//      Server answers: 401 → error on the current password, field emptied and focused; 400 → error on the new
//      password; anything else (500, network) → an alert above the form. One request at a time.
//      Success → the role's first page (hiker: home, staff: slots), and no more redirect to this page.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import PageLayout from '../../../src/components/PageLayout.jsx';
import ChangePasswordPage from '../../../src/pages/auth/ChangePasswordPage.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

const forcedHiker = { ...hiker, mustChangePassword: true };
const GIVEN = 'k7Qp2xWm9aTz';
const NEW = 'my-own-secret-pw';

function renderChange({ user = forcedHiker, layout } = {}) {
  vi.mocked(authApi.me).mockResolvedValue(user);
  renderPage(<ChangePasswordPage />, { path: '/change-password', layout });
}

/** The three fields; the first is labelled "Password you were given" (forced) or "Current password". */
async function fields() {
  const current = await screen.findByLabelText(/^(Password you were given|Current password)$/);
  return {
    current,
    next: screen.getByLabelText('New password'),
    confirm: screen.getByLabelText('Confirm new password'),
  };
}

async function fillAndSubmit({ current = GIVEN, next = NEW, confirm = next } = {}) {
  const f = await fields();
  if (current) await userEvent.type(f.current, current);
  if (next) await userEvent.type(f.next, next);
  if (confirm) await userEvent.type(f.confirm, confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  return f;
}

describe('ChangePasswordPage', () => {
  beforeEach(() => vi.resetAllMocks());

  describe('texts', () => {
    it('forced change: says why the password must be changed, and asks for the password given by staff', async () => {
      renderChange();
      expect(await screen.findByRole('heading', { level: 1, name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByText(/created by the hut staff/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Password you were given')).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(/at least 8 characters/i);
    });

    it('voluntary change: no forced-change text, asks for the current password', async () => {
      renderChange({ user: hiker });
      expect(await screen.findByLabelText('Current password')).toBeRequired();
      expect(screen.queryByText(/created by the hut staff/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Password you were given')).not.toBeInTheDocument();
    });

    it('every field is a required password field', async () => {
      renderChange();
      for (const field of Object.values(await fields())) {
        expect(field).toBeRequired();
        expect(field).toHaveAttribute('type', 'password');
      }
    });
  });

  describe('client checks', () => {
    it('an empty submit shows an error on each field, focuses the first, and sends nothing', async () => {
      renderChange();
      await screen.findByLabelText('Password you were given');
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
      const f = await fields();
      for (const field of Object.values(f)) expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(f.current).toHaveAccessibleDescription(/password/i);
      expect(f.next).toHaveAccessibleDescription(/new password/i);
      expect(f.confirm).toHaveAccessibleDescription(/confirm/i);
      expect(f.current).toHaveFocus();
      expect(authApi.changePassword).not.toHaveBeenCalled();
    });

    it('refuses a new password shorter than 8 characters', async () => {
      renderChange();
      const f = await fillAndSubmit({ next: '1234567' });
      expect(f.next).toHaveAccessibleDescription(/at least 8 characters/i);
      expect(f.next).toHaveFocus();
      expect(authApi.changePassword).not.toHaveBeenCalled();
    });

    it('refuses a new password longer than 128 characters', async () => {
      renderChange();
      const f = await fields();
      await userEvent.type(f.current, GIVEN);
      await userEvent.click(f.next);
      await userEvent.paste('a'.repeat(129));
      await userEvent.click(f.confirm);
      await userEvent.paste('a'.repeat(129));
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
      expect(f.next).toHaveAccessibleDescription(/128 characters or fewer/i);
      expect(authApi.changePassword).not.toHaveBeenCalled();
    });

    it('refuses a confirmation different from the new password', async () => {
      renderChange();
      const f = await fillAndSubmit({ confirm: `${NEW}x` });
      expect(f.confirm).toHaveAccessibleDescription(/do not match/i);
      expect(f.confirm).toHaveFocus();
      expect(authApi.changePassword).not.toHaveBeenCalled();
    });

    it('removes an error on blur once the field is fixed', async () => {
      renderChange();
      const f = await fillAndSubmit({ confirm: `${NEW}x` });
      await userEvent.clear(f.confirm);
      await userEvent.type(f.confirm, NEW);
      await userEvent.tab();
      expect(f.confirm).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('server answers', () => {
    it('sends the current and the new password as typed', async () => {
      vi.mocked(authApi.changePassword).mockResolvedValue(hiker);
      renderChange();
      await fillAndSubmit({ current: ` ${GIVEN} `, next: ' new pass word ' });
      expect(authApi.changePassword).toHaveBeenCalledWith(` ${GIVEN} `, ' new pass word ');
    });

    it('401: the error is on the current password, which is emptied and focused', async () => {
      vi.mocked(authApi.changePassword).mockRejectedValue(new ApiError(401, 'The current password is wrong'));
      renderChange();
      const f = await fillAndSubmit({ current: 'wrong-password' });
      await waitFor(() => expect(f.current).toHaveAccessibleDescription(/The current password is wrong/));
      expect(f.current).toHaveValue('');
      expect(f.current).toHaveFocus();
      expect(f.next).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('400: the error is on the new password', async () => {
      vi.mocked(authApi.changePassword).mockRejectedValue(
        new ApiError(400, 'New password must be different from the current password'),
      );
      renderChange();
      const f = await fillAndSubmit({ current: NEW, next: NEW });
      await waitFor(() => expect(f.next).toHaveAccessibleDescription(/must be different from the current/));
      expect(f.next).toHaveFocus();
      expect(f.current).not.toHaveAttribute('aria-invalid');
    });

    it.each([
      ['a server error', new ApiError(500, 'Something went wrong. Please try again.')],
      ['no connection', new ApiError(0, 'Cannot reach the server.')],
    ])('%s: an alert above the form, with the focus; the form can be sent again', async (_case, error) => {
      vi.mocked(authApi.changePassword).mockRejectedValueOnce(error).mockResolvedValueOnce(hiker);
      renderChange();
      await fillAndSubmit();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(error.message);
      await waitFor(() => expect(alert).toHaveFocus());
      const button = screen.getByRole('button', { name: 'Change password' });
      expect(button).toBeEnabled();
      await userEvent.click(button);
      expect(await screen.findByText('Landed on /')).toBeInTheDocument();
    });

    it('one request at a time: the button is disabled while saving', async () => {
      let finish;
      vi.mocked(authApi.changePassword).mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderChange();
      const f = await fillAndSubmit();
      const saving = screen.getByRole('button', { name: /Saving/ });
      expect(saving).toBeDisabled();
      await userEvent.type(f.confirm, '{Enter}');
      expect(authApi.changePassword).toHaveBeenCalledTimes(1);
      finish(hiker);
      expect(await screen.findByText('Landed on /')).toBeInTheDocument();
    });
  });

  describe('success', () => {
    it('a hiker goes to the home page', async () => {
      vi.mocked(authApi.changePassword).mockResolvedValue({ ...hiker, mustChangePassword: false });
      renderChange();
      await fillAndSubmit();
      expect(await screen.findByText('Landed on /')).toBeInTheDocument();
    });

    it('staff go to the slots', async () => {
      vi.mocked(authApi.changePassword).mockResolvedValue(employee);
      renderChange({ user: employee });
      await fillAndSubmit();
      expect(await screen.findByText('Landed on /staff/slots')).toBeInTheDocument();
    });

    it('inside the layout: no more redirect back to Change password', async () => {
      vi.mocked(authApi.changePassword).mockResolvedValue({ ...hiker, mustChangePassword: false });
      renderChange({ layout: <PageLayout /> });
      await fillAndSubmit();
      expect(await screen.findByText('Landed on /')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Change password' })).not.toBeInTheDocument();
    });
  });
});
