// A page that crashes (ErrorBoundary inside PageLayout): message in the main area, navbar still there.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../../src/api/auth.js';
import { ApiError } from '../../../src/api/client.js';
import PageLayout from '../../../src/components/PageLayout.jsx';
import { renderPage } from '../../helpers/renderPage.jsx';

vi.mock('../../../src/api/auth.js', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));

function BrokenPage() {
  throw new Error('Page crashed');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'Not logged in'));
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the caught error
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows "Something went wrong" and a link to the home page, and keeps the navbar', async () => {
    renderPage(<BrokenPage />, { path: '/broken', layout: <PageLayout /> });
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    const navbar = screen.getByRole('navigation');
    expect(await within(navbar).findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('removes the error when the user goes to another page', async () => {
    renderPage(<BrokenPage />, { path: '/broken', layout: <PageLayout /> });
    await screen.findByRole('heading', { name: 'Something went wrong' });
    await userEvent.click(await within(screen.getByRole('navigation')).findByRole('link', { name: 'Log in' }));
    expect(await screen.findByText('Landed on /login')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });
});
