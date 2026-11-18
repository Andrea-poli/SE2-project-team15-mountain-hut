// MH-07 FT2 – the forced password change, from the story ("they will be forced to change the password on their
// next login, in any case the hiker can recover their password via email") and openapi User.mustChangePassword
// ("the client sends them to the change-password page after login").
//
// CONTRACT
//   F1 A logged-in user with mustChangePassword: true is sent to /change-password from every page (public,
//      hiker, staff, unknown addresses, right after the login), except the forgot-password and reset-password
//      pages, which stay open so the password can be recovered by email. Without the flag (absent or false)
//      there is no redirect. A guest is not sent there; the change-password page is for every logged-in role
//      (hiker, employee, warden). After the change the user can use the site.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import App from '../../../src/App.jsx';
import { AuthProvider } from '../../../src/auth/AuthContext.jsx';
import PageLayout from '../../../src/components/PageLayout.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker, warden } from '../../helpers/users.js';

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
const notLoggedIn = new ApiError(401, 'Not logged in');

/** Any page inside the layout, as in App.jsx: other addresses show "Landed on …". */
function renderInLayout(url) {
  const path = url.split('?')[0];
  renderPage(<p>Page content</p>, { path, url, layout: <PageLayout /> });
}

/** The whole app at `url` (BrowserRouter reads window.location). */
function renderApp(url) {
  window.history.pushState({}, '', url);
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

const changePasswordHeading = () => screen.findByRole('heading', { level: 1, name: 'Change password' });

describe('F1 forced password change', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => window.history.pushState({}, '', '/'));

  it.each([
    '/',
    '/availability',
    '/login',
    '/register',
    '/book?slotId=3',
    '/bookings/7',
    '/staff/slots',
    '/staff/bookings/new',
    '/no-such-page',
  ])('a user with mustChangePassword opening %s is sent to /change-password', async (url) => {
    vi.mocked(authApi.me).mockResolvedValue(forcedHiker);
    renderInLayout(url);
    expect(await screen.findByText('Landed on /change-password')).toBeInTheDocument();
    expect(screen.queryByText('Page content')).not.toBeInTheDocument();
  });

  it('staff with mustChangePassword are sent there too', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ ...employee, mustChangePassword: true });
    renderInLayout('/staff/slots');
    expect(await screen.findByText('Landed on /change-password')).toBeInTheDocument();
  });

  it.each(['/forgot-password', '/reset-password?token=abc123', '/change-password'])(
    '%s stays open for a user with mustChangePassword',
    async (url) => {
      vi.mocked(authApi.me).mockResolvedValue(forcedHiker);
      renderInLayout(url);
      expect(await screen.findByText('Page content')).toBeInTheDocument();
      expect(screen.queryByText(/^Landed on/)).not.toBeInTheDocument();
    },
  );

  it.each([
    ['absent', hiker],
    ['false', { ...hiker, mustChangePassword: false }],
  ])('no redirect when mustChangePassword is %s', async (_case, user) => {
    vi.mocked(authApi.me).mockResolvedValue(user);
    renderInLayout('/book');
    expect(await screen.findByText(user.firstName)).toBeInTheDocument(); // navbar: the user is loaded
    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByText(/^Landed on/)).not.toBeInTheDocument();
  });

  it('a guest is not sent to the change-password page', async () => {
    vi.mocked(authApi.me).mockRejectedValue(notLoggedIn);
    renderInLayout('/availability');
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  describe('in the whole app', () => {
    it('right after logging in with the generated password, the Change password page opens', async () => {
      vi.mocked(authApi.me).mockRejectedValue(notLoggedIn);
      vi.mocked(authApi.login).mockResolvedValue(forcedHiker);
      renderApp('/login');
      await userEvent.type(await screen.findByLabelText('Email'), forcedHiker.email);
      await userEvent.type(screen.getByLabelText('Password'), 'k7Qp2xWm9aTz');
      await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

      expect(await changePasswordHeading()).toBeInTheDocument();
      expect(window.location.pathname).toBe('/change-password');
    });

    it('a hiker page cannot be opened before the change', async () => {
      vi.mocked(authApi.me).mockResolvedValue(forcedHiker);
      renderApp('/book');
      expect(await changePasswordHeading()).toBeInTheDocument();
      expect(window.location.pathname).toBe('/change-password');
      expect(screen.queryByRole('heading', { name: 'Book a table' })).not.toBeInTheDocument();
    });

    it('the reset page of an email link opens, without a redirect', async () => {
      vi.mocked(authApi.me).mockResolvedValue(forcedHiker);
      renderApp('/reset-password?token=abc123');
      expect(await screen.findByLabelText('New password')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/reset-password');
    });

    it.each([
      ['hiker', hiker],
      ['employee', employee],
      ['warden', warden],
    ])('a %s can open Change password', async (_role, user) => {
      vi.mocked(authApi.me).mockResolvedValue(user);
      renderApp('/change-password');
      expect(await changePasswordHeading()).toBeInTheDocument();
      expect(screen.queryByText('This page is not available for your role.')).not.toBeInTheDocument();
    });

    it('a guest opening Change password is asked to log in', async () => {
      vi.mocked(authApi.me).mockRejectedValue(notLoggedIn);
      renderApp('/change-password');
      expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
    });

    it('after the change the hiker reaches the home page and stays there', async () => {
      vi.mocked(authApi.me).mockResolvedValue(forcedHiker);
      vi.mocked(authApi.changePassword).mockResolvedValue({ ...hiker, mustChangePassword: false });
      renderApp('/change-password');
      await userEvent.type(await screen.findByLabelText('Password you were given'), 'k7Qp2xWm9aTz');
      await userEvent.type(screen.getByLabelText('New password'), 'my-own-secret-pw');
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'my-own-secret-pw');
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Mountain Hut' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
      expect(screen.queryByRole('heading', { name: 'Change password' })).not.toBeInTheDocument();
    });
  });
});
