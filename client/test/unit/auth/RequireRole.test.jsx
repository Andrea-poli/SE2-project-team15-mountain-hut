import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import RequireRole from '../../../src/auth/RequireRole.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker, warden } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

// A protected page behind the guard, as in App.jsx (RequireRole is a layout route).
function renderProtected(roles, url) {
  renderPage(<p>Protected content</p>, { path: url.split('?')[0], url, guard: <RequireRole roles={roles} /> });
}

describe('RequireRole', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows "Loading…" during the startup check, not the login page', () => {
    vi.mocked(authApi.me).mockReturnValue(new Promise(() => {}));
    renderProtected(['hiker'], '/book');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText(/Landed on/)).not.toBeInTheDocument();
  });

  it('sends a guest to the login page, with the page (and its query) as next', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderProtected(['hiker'], '/book?slotId=3&partySize=2');
    expect(
      await screen.findByText(`Landed on /login?next=${encodeURIComponent('/book?slotId=3&partySize=2')}`),
    ).toBeInTheDocument();
  });

  it('shows the page to a user with the role', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderProtected(['hiker'], '/book');
    expect(await screen.findByText('Protected content')).toBeInTheDocument();
  });

  it('lets the warden open the employee pages', async () => {
    vi.mocked(authApi.me).mockResolvedValue(warden);
    renderProtected(['employee'], '/staff/slots');
    expect(await screen.findByText('Protected content')).toBeInTheDocument();
  });

  it('tells a hiker that a staff page is not available, with a link home', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderProtected(['employee'], '/staff/slots');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not available' })).toBeInTheDocument();
    expect(screen.getByText('This page is not available for your role.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('sends staff on a hiker page back to the slots', async () => {
    vi.mocked(authApi.me).mockResolvedValue(employee);
    renderProtected(['hiker'], '/book');
    expect(await screen.findByRole('link', { name: 'Go to slots' })).toHaveAttribute('href', '/staff/slots');
  });
});
