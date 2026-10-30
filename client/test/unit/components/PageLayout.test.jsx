// Layout and navbar by role (U7). The navbar is tested inside the layout, as the app shows it.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import PageLayout from '../../../src/components/PageLayout.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';
import { employee, hiker, warden } from '../../helpers/users.js';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

function renderLayout(url = '/somewhere') {
  renderPage(<p>Page content</p>, { path: url, url, layout: <PageLayout /> });
}

const navbar = () => screen.getByRole('navigation');
const linkNames = () =>
  within(navbar())
    .queryAllByRole('link')
    .map((link) => link.textContent);

describe('PageLayout', () => {
  beforeEach(() => vi.resetAllMocks());

  it('starts with a skip link that moves the focus to the main area', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderLayout();
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveFocus();
    await userEvent.click(skip);
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
  });

  it('shows a startup error (server down) in the page', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    renderLayout();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('shows no menu entries during the startup check (no flash of the guest menu)', () => {
    vi.mocked(authApi.me).mockReturnValue(new Promise(() => {}));
    renderLayout();
    expect(linkNames()).toEqual(['Mountain Hut']);
  });

  it('guest: Check availability, Log in, Register', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderLayout();
    await within(navbar()).findByRole('link', { name: 'Log in' });
    expect(linkNames()).toEqual(['Mountain Hut', 'Check availability', 'Log in', 'Register']);
  });

  it('hiker: Check availability, Book a table, name and Log out', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    renderLayout();
    expect(await within(navbar()).findByText('Hannah')).toBeInTheDocument();
    expect(linkNames()).toEqual(['Mountain Hut', 'Check availability', 'Book a table']);
    expect(within(navbar()).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('employee and warden: only Slots, and the logo leads to the slots', async () => {
    for (const user of [employee, warden]) {
      vi.mocked(authApi.me).mockResolvedValue(user);
      const { unmount } = renderPage(<p>Page content</p>, { path: '/x', layout: <PageLayout /> });
      expect(await within(navbar()).findByText(user.firstName)).toBeInTheDocument();
      expect(linkNames(), user.role).toEqual(['Mountain Hut', 'Slots']);
      expect(within(navbar()).getByRole('link', { name: 'Mountain Hut' })).toHaveAttribute('href', '/staff/slots');
      unmount();
    }
  });

  it('marks the current page in the navbar', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    renderLayout('/login');
    expect(await within(navbar()).findByRole('link', { name: 'Log in' })).toHaveAttribute('aria-current', 'page');
    expect(within(navbar()).getByRole('link', { name: 'Register' })).not.toHaveAttribute('aria-current');
  });

  it('Log out goes to the home page and shows the guest menu', async () => {
    vi.mocked(authApi.me).mockResolvedValue(hiker);
    vi.mocked(authApi.logout).mockResolvedValue(null);
    renderLayout('/somewhere');
    await userEvent.click(await within(navbar()).findByRole('button', { name: 'Log out' }));
    expect(await screen.findByText('Landed on /')).toBeInTheDocument();
    await waitFor(() => expect(within(navbar()).getByRole('link', { name: 'Log in' })).toBeInTheDocument());
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
});
